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
