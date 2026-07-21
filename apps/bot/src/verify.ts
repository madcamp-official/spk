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

  console.log("\n[1] 마이그레이션 (migrations/ 전부, 파일명 순서대로)");
  const sqlDir = [
    path.join(HERE, "db", "migrations"),
    path.join(HERE, "..", "src", "db", "migrations"),
  ].find(fs.existsSync)!;
  /* migrate.ts와 같은 순서로 전부 적용한다 — 001만 돌리면 이후 마이그레이션이
     실제로 적용 가능한지(컬럼 추가·제약 변경) 검증되지 않는다. */
  const sqlFiles = fs.readdirSync(sqlDir).filter(f => f.endsWith(".sql")).sort();
  for (const f of sqlFiles) await pg.exec(fs.readFileSync(path.join(sqlDir, f), "utf8"));
  ok("마이그레이션 전부 적용", sqlFiles.length >= 2, sqlFiles.join(" → "));
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

  console.log("\n[2-1] 사인 (왼손잡이 교체분)");
  {
    const { rollCause } = await import("@life-reroll/core");
    ok("모든 생에 사인이 있다",
      Array.from({ length: 500 }, () => rollLife())
        .every(l => l.cause && l.cause.key.length > 0 && l.cause.emoji.length > 0));
    ok("lefty 필드는 사라졌다", !("lefty" in life1));
    /* 같은 생이면 언제 계산해도 같은 사인 — 공유 링크 복원·운세 재렌더가 이걸 믿는다 */
    ok("사인은 결정적", rollCause(life1).key === rollCause(life1).key
      && rollCause(life1).key === life1.cause.key, life1.cause.key);
    /* 젊어 죽으면 사고·감염병, 늙어 죽으면 노환·치매 쪽으로 기울어야 한다 */
    const at = (age: number) => {
      const c: Record<string, number> = {};
      for (let i = 0; i < 400; i++) {
        const l = rollLife();
        const k = rollCause({ ...l, lifeExp: age, income: 1000 + i, iq: 100 }).key;
        c[k] = (c[k] ?? 0) + 1;
      }
      return c;
    };
    const young = at(50), old = at(95);
    ok("젊어 죽으면 사고·감염병이 흔하다",
      ((young["사고"] ?? 0) + (young["감염병"] ?? 0)) > ((old["사고"] ?? 0) + (old["감염병"] ?? 0)),
      `50세 ${(young["사고"] ?? 0) + (young["감염병"] ?? 0)} vs 95세 ${(old["사고"] ?? 0) + (old["감염병"] ?? 0)}`);
    ok("늙어 죽으면 노환·치매가 흔하다",
      ((old["노환"] ?? 0) + (old["치매"] ?? 0)) > ((young["노환"] ?? 0) + (young["치매"] ?? 0)),
      `95세 ${(old["노환"] ?? 0) + (old["치매"] ?? 0)} vs 50세 ${(young["노환"] ?? 0) + (young["치매"] ?? 0)}`);
    /* DB 왕복 */
    const cr = await pg.query<any>("SELECT cause_key, cause_emoji, lefty FROM lives WHERE id=$1", [s1.id]);
    ok("사인이 DB에 저장됨", cr.rows[0].cause_key === life1.cause.key, cr.rows[0].cause_key);
    ok("lefty 컬럼은 NULL 허용으로 남음", cr.rows[0].lefty === null);
  }

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

  console.log("\n[8-1] 웹↔봇 표시 항목 대조");
  {
    /* 웹의 CHIP_DEFS 12개가 봇 임베드에도 전부 있는지 값으로 확인한다.
       라벨이 아니라 **값**을 찾는 이유: 라벨은 묶음 이름(몸·뿌리)이라 안 맞고,
       값이 있어야 실제로 사용자에게 보인다는 뜻이다.
       이 검사가 없어서 /환생에만 민족·종교·몸·사인이 빠진 걸 한참 몰랐다. */
    const { viewFromLife, statFields } = await import("./lib/view.js");
    const l = rollLife();
    const fields = statFields(viewFromLife(l, 1, ["longevity"], 0.001));
    const text = JSON.stringify(fields);
    const want: [string, string][] = [
      ["성별", l.male ? "남성" : "여성"],
      ["태어난 곳", l.urban ? "도시" : "농촌"],
      ["모국어", l.c.lang],
      ["민족", l.eth[0]],
      ["종교", l.rel[0]],
      ["키", `${l.height}cm`],
      ["몸무게", `${l.weight}kg`],
      ["IQ", `IQ ${l.iq}`],
      ["사인", l.cause.key],
      ["탈모", l.balding ? "탈모 예정" : "숱 유지"],
      ["기대수명", `${l.lifeExp}세`],
      ["연 소득", "/년"],
    ];
    const missing = want.filter(([, v]) => !text.includes(v)).map(([k]) => k);
    ok("웹 12항목이 봇에도 전부 있다", missing.length === 0,
      missing.length ? "누락: " + missing.join(", ") : `${want.length}개 확인`);

    /* /환생과 /여권이 같은 항목을 보여주는가 — 두 화면이 갈라지는 것을 막는다 */
    const { viewFromRow } = await import("./lib/view.js");
    const { getLife: fetchLife } = await import("./db/queries.js");
    const rowNow = await fetchLife(s1.id);
    const nA = statFields(viewFromLife(l, 1, [], 0.001)).map(f => f.name).join(",");
    const nB = statFields(viewFromRow(rowNow!)).map(f => f.name).join(",");
    ok("/환생과 /여권의 스탯 필드가 동일", nA === nB, nA);
  }

  console.log("\n[9] 희귀도 점수 (§D)");
  const scores = Array.from({ length: 5000 }, () => rarityScore(rollLife()));
  ok("전부 (0,1] 범위", scores.every(s => s > 0 && s <= 1));
  const sorted = [...scores].sort((x, y) => x - y);
  ok("희귀할수록 작다(단조)", sorted[0]! < sorted[sorted.length - 1]!,
    `최소 ${(sorted[0]! * 100).toExponential(1)}% ~ 최대 ${(sorted[sorted.length - 1]! * 100).toFixed(1)}%`);

  /* ── 3단계 ─────────────────────────────────────────────── */
  const { getDeck, getLife, getLatestLife, renameLife, getGuildDex } = await import("./db/queries.js");
  const { sanitizeName } = await import("./commands/name.js");
  const { parseDeckCustomId, deckCustomId } = await import("./commands/deck.js");
  const { parseDexCustomId, dexCustomId } = await import("./commands/dex.js");
  const { passportEmbed, rowLine } = await import("./lib/rows.js");
  const { DATA, PAGING, countryByCode } = await import("@life-reroll/core");

  console.log("\n[10] /여권");
  const got = await getLife(s1.id);
  ok("생번호로 조회", got?.id === s1.id && got.country_name === life1.c.name);
  const latest = await getLatestLife(U);
  ok("인자 생략 시 최신 생", latest !== null && latest.id >= s1.id);
  ok("없는 생번호는 null", (await getLife(999999)) === null);
  const pe = passportEmbed(got!, "내 생").toJSON();
  ok("여권 임베드에 전적 포함", JSON.stringify(pe).includes("전적"));
  ok("저장된 코드로 국가 복원", countryByCode(got!.country_code)?.name === got!.country_name);

  console.log("\n[11] /덱 (페이지네이션 · 하이라이트)");
  /* 페이지가 넘어가도록 생을 더 넣는다 */
  for (let i = 0; i < PAGING.deckPageSize + 3; i++) {
    await saveLife({ discordId: U, guildId: G, life: rollLife(), inheritedTrait: null });
  }
  const p0 = await getDeck(U, 0, PAGING.deckPageSize);
  const p1 = await getDeck(U, 1, PAGING.deckPageSize);
  ok("1쪽 크기가 pageSize", p0.rows.length === PAGING.deckPageSize, `${p0.rows.length}개`);
  ok("2쪽은 다른 생", p0.rows[0]!.id !== p1.rows[0]!.id);
  ok("총 개수 집계", p0.total > PAGING.deckPageSize, `${p0.total}개`);
  ok("최고 기록 3종 존재", !!(p0.best.longest && p0.best.richest && p0.best.rarest));
  ok("하이라이트는 페이지 무관하게 동일",
    p0.best.rarest!.id === p1.best.rarest!.id);
  const all = await getDeck(U, 0, 1000);
  /* numeric 컬럼은 드라이버에 따라 문자열로 올 수 있다(프로덕션 pg는 숫자 파서를 걸어 두었고,
     검증용 pglite는 아니다). 비교는 양쪽 다 Number로 맞춘다 — 표시 코드도 같은 규약이다. */
  ok("최장수는 실제 최댓값",
    Number(p0.best.longest!.lifespan) === Math.max(...all.rows.map(r => Number(r.lifespan))));
  ok("최희귀는 실제 최솟값(작을수록 희귀)",
    Number(p0.best.rarest!.rarity_score) === Math.min(...all.rows.map(r => Number(r.rarity_score))));
  ok("덱 목록 한 줄 렌더", rowLine(p0.rows[0]!).includes("#"));

  console.log("\n[12] /명명 (소유권 · 입력 정제)");
  const rn = await renameLife(s1.id, U, "첫 생");
  ok("내 생에 이름 붙이기", rn.ok && rn.row.name === "첫 생");
  const other = await renameLife(s1.id, "user-B", "탈취");
  ok("남의 생은 거부 (not_owner)", !other.ok && other.reason === "not_owner");
  const missing = await renameLife(999999, U, "x");
  ok("없는 생은 not_found", !missing.ok && missing.reason === "not_found");
  ok("멘션 제거", sanitizeName("@everyone 위험") === "everyone 위험");
  ok("마크다운 제거", sanitizeName("**굵게**") === "굵게");
  ok("제어문자·줄바꿈 제거", sanitizeName("가\n나\t다") === "가 나 다");
  ok("공백뿐이면 거부", sanitizeName("   ") === null);
  ok("길이 초과 거부", sanitizeName("가".repeat(100)) === null);
  ok("한글·이모지 이름 허용", sanitizeName("행복한 삶 🌏") === "행복한 삶 🌏");

  console.log("\n[13] /도감");
  const dexMap = await getGuildDex(G);
  ok("서버 도감 조회", dexMap.size > 0, `${dexMap.size}개국`);
  ok("도감 총 국가 수는 데이터셋 기준", DATA.length === 198, `${DATA.length}개국`);
  const dexPages = Math.ceil(DATA.length / PAGING.dexPageSize);
  ok("도감 페이지 수 계산", dexPages === Math.ceil(198 / PAGING.dexPageSize), `${dexPages}쪽`);

  console.log("\n[14] 페이지 버튼 custom_id (§A.6)");
  ok("덱 버튼 왕복", parseDeckCustomId(deckCustomId("77", 3))?.page === 3);
  ok("도감 버튼 왕복", parseDexCustomId(dexCustomId("g9", 2))?.guildId === "g9");
  ok("음수 페이지 거부", parseDeckCustomId("deck:77:-1") === null);
  ok("숫자 아닌 페이지 거부", parseDexCustomId("dex:g:abc") === null);
  ok("접두사 다르면 거부", parseDeckCustomId(dexCustomId("g", 1)) === null);

  /* ── 4단계 /배틀 ───────────────────────────────────────── */
  const {
    BATTLE, AXES, drawAxes, resolveBattle, axisWinProb, matchWinProb, pickBestLife,
  } = await import("@life-reroll/core");
  const { countBattlesToday, getBattleDeck, recordBattle, getStamps } =
    await import("./db/queries.js");

  console.log("\n[15] 배틀 판정 (§E)");
  ok("형제 수 축은 제외됨 (데이터 부재)", !AXES.includes("siblings" as never), AXES.join(","));
  ok("축 4종 중 3개 추첨", (() => {
    for (let i = 0; i < 200; i++) {
      const a = drawAxes();
      if (a.length !== BATTLE.axesPerBattle || new Set(a).size !== a.length) return false;
    }
    return true;
  })(), `${BATTLE.axesPerBattle}개, 중복 없음`);
  const strong = { id: 1, lifeExp: 100, income: 500000, pop: 0.1, rarityScore: 1e-8 };
  const weak = { id: 2, lifeExp: 50, income: 500, pop: 1400, rarityScore: 0.5 };
  ok("압도적 우위는 사전 승률 ~1", axisWinProb(1000, 1) > 0.999);
  ok("동일 값은 사전 승률 0.5", Math.abs(axisWinProb(100, 100) - 0.5) < 0.01);
  /* 뒤집힘 한계는 두 보정의 비, 즉 (1+j)/(1-j) 다.
     A가 최대로 뜨고(×1+j) B가 최소로 내려도(×1-j) 못 이기면 확률은 정확히 0이 된다. */
  {
    const j = BATTLE.axisJitter ?? 0;
    const limit = (1 + j) / (1 - j);
    ok("격차가 보정 한계를 넘으면 절대 안 뒤집힌다",
      axisWinProb(100, 100 * limit * 1.001) === 0, `한계 배율 ${limit.toFixed(3)}`);
    ok("한계 안쪽이면 뒤집힐 여지가 있다",
      axisWinProb(100, 100 * limit * 0.999) > 0);
  }
  ok("3판 2선승 확률식", Math.abs(matchWinProb([0.5, 0.5, 0.5]) - 0.5) < 1e-9);
  ok("전승 확률 계산", Math.abs(matchWinProb([1, 1, 1]) - 1) < 1e-9);
  /* 희귀도는 낮은 쪽이 이겨야 한다 (§E) */
  const rareWins = resolveBattle(
    { ...weak, rarityScore: 1e-9 }, { ...weak, id: 3, rarityScore: 0.9 }, ["rarity"]);
  ok("희귀도는 낮은 확률 쪽 승", rareWins.winner === "a");

  console.log("\n[16] 배틀 공정성 · 밸런스 (2만 판)");
  {
    const mk = (id: number) => {
      const l = rollLife();
      return { id, lifeExp: l.lifeExp, income: l.income, pop: l.c.pop, rarityScore: rarityScore(l) };
    };
    let aw = 0, up = 0, cl = 0, merit = 0;
    const N = 20000;
    for (let i = 0; i < N; i++) {
      const r = resolveBattle(mk(i * 2), mk(i * 2 + 1));
      if (r.winner === "a") aw++;
      if (r.upset) up++;
      if (r.close) cl++;
      merit += r.upset ? (MERIT.underdogWin ?? 0) : (MERIT.favoriteWin ?? 0);
    }
    const rate = aw / N;
    ok("선공 편향 없음 (49~51%)", rate > 0.49 && rate < 0.51, `${(rate * 100).toFixed(1)}%`);
    ok("업셋이 희소하다 (1~15%)", up / N > 0.01 && up / N < 0.15, `${(up / N * 100).toFixed(1)}%`);
    ok("접전이 다수 (>50%)", cl / N > 0.5, `2-1이 ${(cl / N * 100).toFixed(1)}%`);
    ok("추가 뽑기 1회에 2~10승 필요",
      (() => { const n = (MERIT.rerollCost ?? 10) / (merit / N); return n >= 2 && n <= 10; })(),
      `${((MERIT.rerollCost ?? 10) / (merit / N)).toFixed(1)}승`);
  }

  console.log("\n[17] 자동 선발 (§E 축별 최적)");
  {
    const deck = [
      { id: 10, lifeExp: 100, income: 100, pop: 500, rarityScore: 0.5 },
      { id: 11, lifeExp: 50, income: 100000, pop: 500, rarityScore: 0.5 },
    ];
    ok("수명 축이면 장수한 생", pickBestLife(deck, ["lifeExp"])!.id === 10);
    ok("소득 축이면 부유한 생", pickBestLife(deck, ["income"])!.id === 11);
    ok("빈 덱은 null", pickBestLife([], ["income"]) === null);
    ok("한 장이면 그 생", pickBestLife([deck[0]!], ["income"])!.id === 10);
  }

  console.log("\n[18] 배틀 기록 (전적·도장·공덕 원자성)");
  {
    const U2 = "user-B";
    await ensureUser(U2);
    const s = await saveLife({ discordId: U2, guildId: G, life: rollLife(), inheritedTrait: null });
    const myDeck = await getBattleDeck(U);
    const a = myDeck[0]!;
    const before = await getMerit(U);
    const rec = await recordBattle({
      lifeA: a.id, lifeB: s.id, axes: ["lifeExp", "income", "rarity"],
      winnerLifeId: a.id, winnerUserId: U, loserLifeId: s.id,
      loserCountryCode: (await getLife(s.id))!.country_code,
      upset: true, meritAward: MERIT.underdogWin ?? 0,
    });
    const wl = await pg.query<any>("SELECT wins,losses FROM lives WHERE id=$1", [a.id]);
    const wl2 = await pg.query<any>("SELECT wins,losses FROM lives WHERE id=$1", [s.id]);
    ok("승자 wins +1", Number(wl.rows[0].wins) === 1 && Number(wl.rows[0].losses) === 0);
    ok("패자 losses +1", Number(wl2.rows[0].losses) === 1 && Number(wl2.rows[0].wins) === 0);
    ok("공덕 지급", rec.merit === before + (MERIT.underdogWin ?? 0), `${before} → ${rec.merit}`);
    ok("방문 도장 획득", rec.newStamp && (await getStamps(U)).size === 1);
    const b2 = await pg.query<any>("SELECT axes, upset, winner FROM battles ORDER BY id DESC LIMIT 1");
    ok("배틀 기록 저장", b2.rows[0].axes.length === 3 && b2.rows[0].upset === true);
    ok("같은 상대 오늘 대전 수 집계", (await countBattlesToday(U, U2)) === 1);
    /* 같은 나라에 또 이겨도 도장은 하나 */
    const rec2 = await recordBattle({
      lifeA: a.id, lifeB: s.id, axes: ["pop"], winnerLifeId: a.id, winnerUserId: U,
      loserLifeId: s.id, loserCountryCode: (await getLife(s.id))!.country_code,
      upset: false, meritAward: MERIT.favoriteWin ?? 0,
    });
    ok("같은 국가 도장은 중복 안 됨", !rec2.newStamp && (await getStamps(U)).size === 1);
    ok("상한 판정에 반영", (await countBattlesToday(U, U2)) === 2);
  }

  await pg.close();
  console.log(`\n=== ${pass} PASS / ${fail} FAIL ===`);
  if (fail) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
