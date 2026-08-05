/* DB 접근 — apps/bot/src/db/queries.ts 이식본. 커맨드 파일에는 SQL 이 없다.
 * §A.5 원자성 규약 그대로: SEQUENCE 발급(RETURNING), 조건부 UPDATE + 반환 행 수 판정.
 * 차이는 하나 — Workers 는 모듈 전역 db 를 못 쓰므로(동시 요청이 격리를 공유한다)
 * 모든 함수가 요청 수명의 db 핸들(makeDb)을 첫 인자로 받는다. */
import { altLifeName, deriveTraits, formatLifeName, isoCode, rarityScore } from "../../apps/web/core/index.js";

export async function ensureUser(db, discordId) {
  await db.query(
    "INSERT INTO users (discord_id) VALUES ($1) ON CONFLICT (discord_id) DO NOTHING",
    [discordId]);
}

/** 오늘(tz 기준) 이 유저가 뽑은 횟수. §G — 별도 카운터 테이블을 두지 않는다. */
export async function countRollsToday(db, discordId, tz) {
  const r = await db.query(
    `SELECT count(*)::int AS n FROM lives
      WHERE user_id = $1
        AND (created_at AT TIME ZONE $2)::date = (now() AT TIME ZONE $2)::date`,
    [discordId, tz]);
  return Number(r.rows[0]?.n ?? 0);
}

/** 공덕 차감 (§A.5). 성공하면 남은 공덕, 잔액 부족이면 null. */
export async function spendMerit(db, discordId, cost) {
  const r = await db.query(
    `UPDATE users SET merit = merit - $2
      WHERE discord_id = $1 AND merit >= $2
      RETURNING merit`,
    [discordId, cost]);
  return r.rowCount === 1 ? r.rows[0].merit : null;
}

export async function getMerit(db, discordId) {
  const r = await db.query("SELECT merit FROM users WHERE discord_id = $1", [discordId]);
  return r.rows[0]?.merit ?? 0;
}

/** 생 저장 + 서버 도감 기록 — 한 트랜잭션 (queries.ts 와 같은 이유). */
export async function saveLife(db, opts) {
  const { discordId, guildId, life } = opts;
  const traits = deriveTraits(life).map(t => t.key);
  const score = rarityScore(life);
  const code = isoCode(life.c.flag);

  return db.withTx(async (tx) => {
    if (guildId) {
      await tx.query(
        "INSERT INTO guilds (guild_id) VALUES ($1) ON CONFLICT (guild_id) DO NOTHING", [guildId]);
    }
    const ins = await tx.query(
      `INSERT INTO lives (
         user_id, guild_id, country_code, country_name, gender, lifespan,
         income_usd, income_mult, income_top_pct, urban,
         iq, height_cm, weight_kg, religion, ethnicity, balding,
         cause_key, cause_emoji, gen_name, gen_name_alt, traits, rarity_score, inherited_trait)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
       RETURNING id`,
      [discordId, guildId, code, life.c.name, life.male ? "male" : "female", life.lifeExp,
        Math.round(life.income), life.income / life.c.gdp, life.top, life.urban,
        life.iq, life.height, life.weight, life.rel[0], life.eth[0], life.balding,
        life.cause.key, life.cause.emoji,
        formatLifeName(life.name, "ko"), altLifeName(life.name, "ko"),
        traits, score, opts.inheritedTrait]);
    const id = ins.rows[0].id;

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

/* ===== /여권 · /덱 · /명명 · /도감 ===== */

export async function getLife(db, id) {
  const r = await db.query("SELECT * FROM lives WHERE id = $1", [id]);
  return r.rows[0] ?? null;
}

export async function getLatestLife(db, discordId) {
  const r = await db.query(
    "SELECT * FROM lives WHERE user_id = $1 ORDER BY id DESC LIMIT 1", [discordId]);
  return r.rows[0] ?? null;
}

/** /덱 — 한 페이지 + 최고 기록 3종(페이지 무관, 덱 전체 기준). */
export async function getDeck(db, discordId, page, pageSize) {
  const [cnt, rows, longest, richest, rarest] = await Promise.all([
    db.query("SELECT count(*)::int AS n FROM lives WHERE user_id=$1", [discordId]),
    db.query(
      "SELECT * FROM lives WHERE user_id=$1 ORDER BY id DESC LIMIT $2 OFFSET $3",
      [discordId, pageSize, page * pageSize]),
    db.query(
      "SELECT * FROM lives WHERE user_id=$1 ORDER BY lifespan DESC, id ASC LIMIT 1", [discordId]),
    db.query(
      "SELECT * FROM lives WHERE user_id=$1 ORDER BY income_usd DESC, id ASC LIMIT 1", [discordId]),
    db.query(
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

/** /명명 — 소유 검사를 WHERE 에 넣어 원자적으로. */
export async function renameLife(db, id, discordId, name) {
  const r = await db.query(
    "UPDATE lives SET name=$3 WHERE id=$1 AND user_id=$2 RETURNING *", [id, discordId, name]);
  if (r.rowCount === 1) return { ok: true, row: r.rows[0] };
  const exists = await db.query("SELECT count(*)::int AS n FROM lives WHERE id=$1", [id]);
  return { ok: false, reason: Number(exists.rows[0]?.n ?? 0) ? "not_owner" : "not_found" };
}

/** /도감 — 이 서버가 모은 국가 코드 집합. */
export async function getGuildDex(db, guildId) {
  const r = await db.query(
    "SELECT country_code, first_life_id FROM guild_dex WHERE guild_id=$1", [guildId]);
  return new Map(r.rows.map(x => [x.country_code, x.first_life_id]));
}

/* ===== /배틀 ===== */

export async function getBattleDeck(db, discordId) {
  const r = await db.query("SELECT * FROM lives WHERE user_id=$1 ORDER BY id ASC", [discordId]);
  return r.rows;
}

export async function countBattlesToday(db, userA, userB, tz) {
  const r = await db.query(
    `SELECT count(*)::int AS n FROM battles b
       JOIN lives la ON la.id = b.life_a
       JOIN lives lb ON lb.id = b.life_b
      WHERE ((la.user_id=$1 AND lb.user_id=$2) OR (la.user_id=$2 AND lb.user_id=$1))
        AND (b.created_at AT TIME ZONE $3)::date = (now() AT TIME ZONE $3)::date`,
    [userA, userB, tz]);
  return Number(r.rows[0]?.n ?? 0);
}

/** 배틀 기록 — 전적·방문 도장·공덕을 한 트랜잭션으로 (queries.ts 와 같은 이유). */
export async function recordBattle(db, r) {
  return db.withTx(async (tx) => {
    await tx.query(
      `INSERT INTO battles (life_a, life_b, axes, winner, upset)
       VALUES ($1,$2,$3,$4,$5)`,
      [r.lifeA, r.lifeB, r.axes, r.winnerLifeId, r.upset]);
    await tx.query("UPDATE lives SET wins = wins + 1 WHERE id=$1", [r.winnerLifeId]);
    await tx.query("UPDATE lives SET losses = losses + 1 WHERE id=$1", [r.loserLifeId]);
    const st = await tx.query(
      `INSERT INTO stamps (user_id, country_code) VALUES ($1,$2)
       ON CONFLICT (user_id, country_code) DO NOTHING`,
      [r.winnerUserId, r.loserCountryCode]);
    const m = await tx.query(
      "UPDATE users SET merit = merit + $2 WHERE discord_id=$1 RETURNING merit",
      [r.winnerUserId, r.meritAward]);
    return { merit: m.rows[0]?.merit ?? 0, newStamp: st.rowCount === 1 };
  });
}
