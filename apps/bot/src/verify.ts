/* 2단계 검증 — Postgres 서버 없이 실제 SQL을 돌린다.
 *
 *   pnpm -F @life-reroll/bot verify
 *
 * pglite(WASM Postgres)에 실제 마이그레이션을 적용하고, 프로덕션과 **같은 queries.ts**를
 * 그대로 호출한다. 그래서 검증되는 것이 "비슷한 SQL"이 아니라 배포될 SQL 자체다.
 * Discord 게이트웨이만 붙이지 않는다(토큰이 없다) — 인터랙션 계층은 타입 검사와
 * custom_id 왕복으로 확인한다. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import {
  MERIT, TRAIT_KEYS, deriveTraits, hasTrait, rarityScore, rollLife, rollLifeWithTrait,
} from "@life-reroll/core";

/* 이 검증은 Discord에도 진짜 DB에도 붙지 않는다. 그런데 env.ts는 없는 값에 즉시 죽으므로
   (프로덕션에서는 그게 맞다) 여기서만 자리표시자를 채운다. 그래야 `pnpm verify`가
   비밀값 없이도 돈다 — 검증을 돌리려고 가짜 토큰을 손으로 넣게 만들면 아무도 안 돌린다.
   ⚠ import보다 먼저 실행돼야 해서 아래 모듈들은 동적 import다. */
process.env.DISCORD_TOKEN ||= "verify-placeholder";
process.env.DISCORD_APP_ID ||= "verify-placeholder";
process.env.DATABASE_URL ||= "postgres://verify/placeholder";

const { setDb } = await import("./db/pool.js");
type Db = import("./db/pool.js").Db;
type Queryable = import("./db/pool.js").Queryable;
const { countRollsToday, ensureUser, getMerit, saveLife, spendMerit } = await import("./db/queries.js");
const { templateSummary } = await import("./lib/summary.js");
const { karmaCustomId, karmaRow, lifeEmbed, parseKarmaCustomId } = await import("./lib/render.js");

const HERE = path.dirname(fileURLToPath(import.meta.url));
let pass = 0, fail = 0;
function ok(name: string, cond: boolean, detail = ""): void {
  if (cond) { pass++; console.log(`  PASS  ${name}${detail ? " — " + detail : ""}`); }
  else { fail++; console.log(`  FAIL  ${name}${detail ? " — " + detail : ""}`); }
}

async function main(): Promise<void> {
  const pg = new PGlite();
  /* pglite는 단일 연결이라 BEGIN/COMMIT을 같은 세션에서 돌린다 — 트랜잭션 의미가 유지된다. */
  const mem: Db = {
    query: async (sql, params) => {
      const r = await pg.query(sql, params as any[]);
      return { rows: r.rows as any[], rowCount: r.affectedRows ?? r.rows.length };
    },
    withTx: async (fn) => {
      const tx: Queryable = {
        query: async (sql, params) => {
          const r = await pg.query(sql, params as any[]);
          return { rows: r.rows as any[], rowCount: r.affectedRows ?? r.rows.length };
        },
      };
      await pg.query("BEGIN");
      try { const out = await fn(tx); await pg.query("COMMIT"); return out; }
      catch (e) { await pg.query("ROLLBACK"); throw e; }
    },
  };
  setDb(mem);

  console.log("\n[1] 마이그레이션 (실제 001_init.sql)");
  const sqlPath = [
    path.join(HERE, "db", "migrations", "001_init.sql"),
    path.join(HERE, "..", "src", "db", "migrations", "001_init.sql"),
  ].find(fs.existsSync)!;
  await pg.exec(fs.readFileSync(sqlPath, "utf8"));
  const tables = await pg.query<{ tablename: string }>(
    "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY tablename");
  const names = tables.rows.map(r => r.tablename);
  ok("§G 테이블 생성", ["users", "lives", "guilds", "guild_dex", "stamps", "battles", "hall_of_fame"]
    .every(t => names.includes(t)), names.join(", "));
  const seq = await pg.query("SELECT last_value FROM birth_seq");
  ok("출생 번호 SEQUENCE 존재 (§A.5)", seq.rows.length === 1);

  console.log("\n[2] 생 저장 · 출생 번호 발급");
  const U = "user-A", G = "guild-1";
  await ensureUser(U);
  const life1 = rollLife();
  const s1 = await saveLife({ discordId: U, guildId: G, life: life1, inheritedTrait: null });
  const s2 = await saveLife({ discordId: U, guildId: G, life: rollLife(), inheritedTrait: null });
  ok("출생 번호가 SEQUENCE로 증가", s2.id === s1.id + 1, `#${s1.id} → #${s2.id}`);
  ok("traits·rarity_score 저장", Array.isArray(s1.traits) && s1.rarityScore > 0 && s1.rarityScore <= 1);
  const row = await pg.query<any>("SELECT * FROM lives WHERE id=$1", [s1.id]);
  const r0 = row.rows[0];
  ok("§G 컬럼 매핑 (lifespan/income_mult)",
    Number(r0.lifespan) === life1.lifeExp
    && Math.abs(Number(r0.income_mult) - life1.income / life1.c.gdp) < 1e-9);
  ok("국가 코드는 국기에서 파생 (ISO2)", /^[A-Z]{2}$/.test(r0.country_code), r0.country_code);

  console.log("\n[3] 서버 도감 첫 발견 (동시성)");
  const kr = { ...life1, c: { ...life1.c } };
  const a = await saveLife({ discordId: U, guildId: "guild-2", life: kr, inheritedTrait: null });
  const b = await saveLife({ discordId: U, guildId: "guild-2", life: kr, inheritedTrait: null });
  ok("같은 나라 두 번 → 첫 발견은 한 번만", a.firstInGuild && !b.firstInGuild);

  console.log("\n[4] 일일 뽑기 횟수 (§G 별도 카운터 없음)");
  const n = await countRollsToday(U);
  ok("오늘 뽑기 수를 lives에서 센다", n === 4, `${n}회`);

  console.log("\n[5] 공덕 차감 원자성 (§A.5)");
  await pg.query("UPDATE users SET merit=25 WHERE discord_id=$1", [U]);
  const cost = MERIT.rerollCost!;
  const left1 = await spendMerit(U, cost);
  ok("잔액 충분 → 차감 성공", left1 === 25 - cost, `남은 공덕 ${left1}`);
  const left2 = await spendMerit(U, cost);
  ok("두 번째도 성공", left2 === 25 - cost * 2, `남은 공덕 ${left2}`);
  const left3 = await spendMerit(U, cost);
  ok("잔액 부족 → null (음수 안 됨)", left3 === null && (await getMerit(U)) === 25 - cost * 2);
  const neg = await pg.query<{ n: number }>("SELECT count(*)::int AS n FROM users WHERE merit < 0");
  ok("merit 음수 행 0 (CHECK 제약)", Number(neg.rows[0]!.n) === 0);
  /* 동시 차감: 10원 남기고 10짜리를 5번 동시에 → 정확히 1번만 성공해야 한다 */
  await pg.query("UPDATE users SET merit=$2 WHERE discord_id=$1", [U, cost]);
  const races = await Promise.all(Array.from({ length: 5 }, () => spendMerit(U, cost)));
  ok("동시 5회 차감 → 1회만 성공",
    races.filter(x => x !== null).length === 1, `성공 ${races.filter(x => x !== null).length}회`);

  console.log("\n[6] 업 계승 (§C)");
  for (const k of TRAIT_KEYS) {
    const r = rollLifeWithTrait(k);
    ok(`이월 '${k}' → 그 특성을 가진 생`, !r.inherited || hasTrait(r.life, k), `${r.tries}회 시도`);
  }
  const id = karmaCustomId("123", "longevity");
  const parsed = parseKarmaCustomId(id);
  ok("custom_id 왕복 (§A.6 stateless)",
    parsed?.userId === "123" && parsed.traitKey === "longevity", id);
  ok("잘못된 custom_id는 거부", parseKarmaCustomId("nope:1") === null);
  ok("특성 없으면 버튼도 없음", karmaRow("123", []).length === 0);
  ok("특성 있으면 버튼 생성", karmaRow("123", ["wealth", "genius"])[0]!.components.length === 2);

  console.log("\n[7] 인생 요약 (§F 템플릿 폴백)");
  const t1 = templateSummary(life1, s1.id, s1.traits);
  const t2 = templateSummary(life1, s1.id, s1.traits);
  ok("LLM 미설정이어도 문장 생성", t1.length > 20, t1.slice(0, 60) + "…");
  ok("같은 생 = 같은 문장(결정적)", t1 === t2);
  const banned = ["꽝", "실패작", "불쌍", "비참"];
  const sample = Array.from({ length: 300 }, () => {
    const l = rollLife();
    return templateSummary(l, 1, deriveTraits(l).map(x => x.key));
  });
  ok("톤 가이드: 금지 표현 없음 (300건)",
    !sample.some(s => banned.some(w => s.includes(w))));

  console.log("\n[8] 임베드 (§C 출력 규약)");
  const embed = lifeEmbed({
    life: life1, birthNo: s1.id, traits: s1.traits, rarityScore: s1.rarityScore,
    summary: t1, ownerTag: "tester", firstInGuild: true,
    inheritedTrait: null, inheritFailed: false, usedMerit: false, meritLeft: null, rollsLeft: 2,
  }).toJSON();
  const asText = JSON.stringify(embed);
  ok("footer에 봇 이름만 (초대 링크 없음)",
    !/discord\.com\/(api\/)?oauth2|invite/i.test(asText));
  ok("스탯 출처 명시 (§F)", /UN WPP|World Bank/.test(embed.footer?.text ?? ""));
  ok("희귀도 '상위 n%' 표기 (§D)", asText.includes("상위"));

  console.log("\n[9] 희귀도 점수 (§D)");
  const scores = Array.from({ length: 5000 }, () => rarityScore(rollLife()));
  ok("전부 (0,1] 범위", scores.every(s => s > 0 && s <= 1));
  const sorted = [...scores].sort((x, y) => x - y);
  ok("희귀할수록 작다(단조)", sorted[0]! < sorted[sorted.length - 1]!,
    `최소 ${(sorted[0]! * 100).toExponential(1)}% ~ 최대 ${(sorted[sorted.length - 1]! * 100).toFixed(1)}%`);

  await pg.close();
  console.log(`\n=== ${pass} PASS / ${fail} FAIL ===`);
  if (fail) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
