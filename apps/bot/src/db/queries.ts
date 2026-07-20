/* DB 접근 — 전부 여기로 모은다. 커맨드 파일에는 SQL이 없다.
 *
 * §A.5 동시성 규약을 지키는 곳이다:
 *   · 출생 번호는 SEQUENCE(DEFAULT nextval)가 발급한다 — 앱은 번호를 만들지 않고 RETURNING으로 받는다.
 *   · 공덕 차감은 조건부 UPDATE ... WHERE merit >= cost + 반환 행 수로 성공을 판정한다.
 *     (읽고→검사하고→쓰면 두 요청이 같은 잔액을 읽어 마이너스가 된다.) */
import type { Life } from "@life-reroll/core";
import { deriveTraits, rarityScore, isoCode } from "@life-reroll/core";
import { db } from "./pool.js";
import { env } from "../env.js";

export interface SavedLife {
  id: number;              // 출생 번호
  traits: string[];
  rarityScore: number;
  firstInGuild: boolean;   // 이 서버에서 처음 발견된 국가인가
}

/** 유저 행 보장. 없으면 만들고, 있으면 아무것도 하지 않는다. */
export async function ensureUser(discordId: string): Promise<void> {
  await db.query(
    "INSERT INTO users (discord_id) VALUES ($1) ON CONFLICT (discord_id) DO NOTHING",
    [discordId]);
}

/** 오늘(ROLL_DAY_TZ 기준) 이 유저가 뽑은 횟수. §G — 별도 카운터 테이블을 두지 않는다. */
export async function countRollsToday(discordId: string): Promise<number> {
  const r = await db.query<{ n: string }>(
    `SELECT count(*)::int AS n FROM lives
      WHERE user_id = $1
        AND (created_at AT TIME ZONE $2)::date = (now() AT TIME ZONE $2)::date`,
    [discordId, env.rollDayTz]);
  return Number(r.rows[0]?.n ?? 0);
}

/** 공덕 차감 (§A.5). 성공하면 남은 공덕, 잔액 부족이면 null.
 *  UPDATE가 0행이면 실패다 — 별도 SELECT로 확인하지 않는다(그 사이에 값이 바뀐다). */
export async function spendMerit(discordId: string, cost: number): Promise<number | null> {
  const r = await db.query<{ merit: number }>(
    `UPDATE users SET merit = merit - $2
      WHERE discord_id = $1 AND merit >= $2
      RETURNING merit`,
    [discordId, cost]);
  return r.rowCount === 1 ? r.rows[0]!.merit : null;
}

export async function getMerit(discordId: string): Promise<number> {
  const r = await db.query<{ merit: number }>(
    "SELECT merit FROM users WHERE discord_id = $1", [discordId]);
  return r.rows[0]?.merit ?? 0;
}

/** 생을 저장하고 출생 번호를 받는다. 서버 도감(첫 발견)도 같은 트랜잭션에서 기록한다. */
export async function saveLife(opts: {
  discordId: string;
  guildId: string | null;
  life: Life;
  inheritedTrait: string | null;
}): Promise<SavedLife> {
  const { discordId, guildId, life } = opts;
  const traits = deriveTraits(life).map(t => t.key);
  const score = rarityScore(life);
  const code = isoCode(life.c.flag);

  /* 생 저장과 서버 도감 기록은 한 트랜잭션이어야 한다 — 생만 들어가고 도감이 빠지면
     "첫 발견"이 영원히 안 잡히고, 반대면 존재하지 않는 생을 도감이 가리킨다. */
  return db.withTx(async (tx) => {
    if (guildId) {
      await tx.query(
        "INSERT INTO guilds (guild_id) VALUES ($1) ON CONFLICT (guild_id) DO NOTHING", [guildId]);
    }
    const ins = await tx.query<{ id: number }>(
      `INSERT INTO lives (
         user_id, guild_id, country_code, country_name, gender, lifespan,
         income_usd, income_mult, income_top_pct, urban,
         iq, height_cm, weight_kg, religion, ethnicity, lefty, balding,
         traits, rarity_score, inherited_trait)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)
       RETURNING id`,                                   /* 출생 번호는 SEQUENCE가 준다 (§A.5) */
      [discordId, guildId, code, life.c.name, life.male ? "male" : "female", life.lifeExp,
        Math.round(life.income), life.income / life.c.gdp, life.top, life.urban,
        life.iq, life.height, life.weight, life.rel[0], life.eth[0], life.lefty, life.balding,
        traits, score, opts.inheritedTrait]);
    const id = ins.rows[0]!.id;

    /* 서버 첫 발견 판정. ON CONFLICT DO NOTHING 이므로 먼저 넣은 쪽만 행을 받는다 —
       동시에 같은 나라를 뽑아도 "첫 발견"은 한 명에게만 간다. */
    let firstInGuild = false;
    if (guildId) {
      const dex = await tx.query(
        `INSERT INTO guild_dex (guild_id, country_code, first_life_id)
         VALUES ($1,$2,$3) ON CONFLICT (guild_id, country_code) DO NOTHING`,
        [guildId, code, id]);
      firstInGuild = dex.rowCount === 1;
    }
    return { id, traits, rarityScore: score, firstInGuild };
  });
}

/* ===== 3단계 — /여권 · /덱 · /명명 · /도감 ===================== */

/** DB에 저장된 생 한 줄. core의 Life와 필드명이 다르다(§G 컬럼명) — 표시 계층이 변환한다. */
export interface LifeRow {
  id: number;
  user_id: string;
  guild_id: string | null;
  country_code: string;
  country_name: string;
  gender: "male" | "female";
  lifespan: number;
  income_usd: number;
  income_mult: number;
  income_top_pct: number;
  urban: boolean;
  iq: number;
  height_cm: number;
  weight_kg: number;
  religion: string;
  ethnicity: string;
  lefty: boolean;
  balding: boolean;
  traits: string[];
  rarity_score: number;
  inherited_trait: string | null;
  name: string | null;
  wins: number;
  losses: number;
  created_at: Date;
}

/** 생 하나. 없으면 null. */
export async function getLife(id: number): Promise<LifeRow | null> {
  const r = await db.query<LifeRow>("SELECT * FROM lives WHERE id = $1", [id]);
  return r.rows[0] ?? null;
}

/** 이 유저의 가장 최근 생 (/여권 인자 생략 시) */
export async function getLatestLife(discordId: string): Promise<LifeRow | null> {
  const r = await db.query<LifeRow>(
    "SELECT * FROM lives WHERE user_id = $1 ORDER BY id DESC LIMIT 1", [discordId]);
  return r.rows[0] ?? null;
}

export interface DeckPage {
  total: number;
  rows: LifeRow[];
  /** §C "최고 기록 3종 하이라이트" */
  best: { longest: LifeRow | null; richest: LifeRow | null; rarest: LifeRow | null };
}

/** /덱 — 로스터 한 페이지 + 최고 기록 3종.
 *  하이라이트는 페이지와 무관하게 덱 전체에서 뽑는다(페이지를 넘겨도 같은 기록이 보여야 한다). */
export async function getDeck(discordId: string, page: number, pageSize: number): Promise<DeckPage> {
  const [cnt, rows, longest, richest, rarest] = await Promise.all([
    db.query<{ n: number }>("SELECT count(*)::int AS n FROM lives WHERE user_id=$1", [discordId]),
    db.query<LifeRow>(
      "SELECT * FROM lives WHERE user_id=$1 ORDER BY id DESC LIMIT $2 OFFSET $3",
      [discordId, pageSize, page * pageSize]),
    db.query<LifeRow>(
      "SELECT * FROM lives WHERE user_id=$1 ORDER BY lifespan DESC, id ASC LIMIT 1", [discordId]),
    db.query<LifeRow>(
      "SELECT * FROM lives WHERE user_id=$1 ORDER BY income_usd DESC, id ASC LIMIT 1", [discordId]),
    /* 희귀도는 작을수록 희귀하다 */
    db.query<LifeRow>(
      "SELECT * FROM lives WHERE user_id=$1 ORDER BY rarity_score ASC, id ASC LIMIT 1", [discordId]),
  ]);
  return {
    total: Number(cnt.rows[0]?.n ?? 0),
    rows: rows.rows,
    best: {
      longest: longest.rows[0] ?? null,
      richest: richest.rows[0] ?? null,
      rarest: rarest.rows[0] ?? null,
    },
  };
}

/** /명명 — 자기 생에만 이름을 붙인다.
 *  소유 검사를 WHERE에 넣어 한 번에 처리한다 — 읽고 확인한 뒤 쓰면 그 사이가 비어 있다. */
export async function renameLife(
  id: number, discordId: string, name: string,
): Promise<{ ok: true; row: LifeRow } | { ok: false; reason: "not_found" | "not_owner" }> {
  const r = await db.query<LifeRow>(
    "UPDATE lives SET name=$3 WHERE id=$1 AND user_id=$2 RETURNING *", [id, discordId, name]);
  if (r.rowCount === 1) return { ok: true, row: r.rows[0]! };
  /* 실패 원인을 갈라 준다 — "없는 생"과 "남의 생"은 사용자에게 다른 말이다 */
  const exists = await db.query<{ n: number }>(
    "SELECT count(*)::int AS n FROM lives WHERE id=$1", [id]);
  return { ok: false, reason: Number(exists.rows[0]?.n ?? 0) ? "not_owner" : "not_found" };
}

/** /도감 — 이 서버가 모은 국가 코드와 첫 발견 생. */
export async function getGuildDex(guildId: string): Promise<Map<string, number | null>> {
  const r = await db.query<{ country_code: string; first_life_id: number | null }>(
    "SELECT country_code, first_life_id FROM guild_dex WHERE guild_id=$1", [guildId]);
  return new Map(r.rows.map(x => [x.country_code, x.first_life_id]));
}

/* ===== 4단계 — /배틀 ============================================ */

/** 배틀 출전 후보. pop은 저장돼 있지 않고 국가 코드에서 파생한다. */
export async function getBattleDeck(discordId: string): Promise<LifeRow[]> {
  const r = await db.query<LifeRow>(
    "SELECT * FROM lives WHERE user_id=$1 ORDER BY id ASC", [discordId]);
  return r.rows;
}

/** 오늘 이 두 사람이 붙은 횟수 (§E 같은 상대 1일 상한).
 *  battles에는 생 번호만 있으므로 lives를 두 번 조인해 유저로 되돌린다. */
export async function countBattlesToday(userA: string, userB: string): Promise<number> {
  const r = await db.query<{ n: number }>(
    `SELECT count(*)::int AS n FROM battles b
       JOIN lives la ON la.id = b.life_a
       JOIN lives lb ON lb.id = b.life_b
      WHERE ((la.user_id=$1 AND lb.user_id=$2) OR (la.user_id=$2 AND lb.user_id=$1))
        AND (b.created_at AT TIME ZONE $3)::date = (now() AT TIME ZONE $3)::date`,
    [userA, userB, env.rollDayTz]);
  return Number(r.rows[0]?.n ?? 0);
}

export interface BattleRecord {
  lifeA: number;
  lifeB: number;
  axes: string[];
  winnerLifeId: number;
  winnerUserId: string;
  loserLifeId: number;
  loserCountryCode: string;
  upset: boolean;
  meritAward: number;
}

/** 배틀 결과를 기록한다 — 전적·방문 도장·공덕을 **한 트랜잭션**으로.
 *  나뉘면 "전적은 올랐는데 공덕은 안 들어온" 상태가 남고, 사용자는 그걸 버그로만 본다. */
export async function recordBattle(r: BattleRecord): Promise<{ merit: number; newStamp: boolean }> {
  return db.withTx(async (tx) => {
    await tx.query(
      `INSERT INTO battles (life_a, life_b, axes, winner, upset)
       VALUES ($1,$2,$3,$4,$5)`,
      [r.lifeA, r.lifeB, r.axes, r.winnerLifeId, r.upset]);
    await tx.query("UPDATE lives SET wins = wins + 1 WHERE id=$1", [r.winnerLifeId]);
    await tx.query("UPDATE lives SET losses = losses + 1 WHERE id=$1", [r.loserLifeId]);
    /* §E 방문 도장 — 이긴 사람이 진 생의 국가에 도장을 찍는다(개인 도감 우회 수집로) */
    const st = await tx.query(
      `INSERT INTO stamps (user_id, country_code) VALUES ($1,$2)
       ON CONFLICT (user_id, country_code) DO NOTHING`,
      [r.winnerUserId, r.loserCountryCode]);
    const m = await tx.query<{ merit: number }>(
      "UPDATE users SET merit = merit + $2 WHERE discord_id=$1 RETURNING merit",
      [r.winnerUserId, r.meritAward]);
    return { merit: m.rows[0]?.merit ?? 0, newStamp: st.rowCount === 1 };
  });
}

/** 내가 찍은 방문 도장 (개인 수집) */
export async function getStamps(discordId: string): Promise<Set<string>> {
  const r = await db.query<{ country_code: string }>(
    "SELECT country_code FROM stamps WHERE user_id=$1", [discordId]);
  return new Set(r.rows.map(x => x.country_code));
}
