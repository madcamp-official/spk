/* 환경변수 로딩·검증.
 *
 * dotenv를 쓰지 않는다 — node 20.6+ 는 `node --env-file=.env` 를 기본 제공하고,
 * 배포처(Railway/Fly)는 어차피 환경변수를 직접 주입한다. 의존성을 하나 줄인다.
 *
 * 없으면 못 도는 값은 여기서 즉시 죽인다. 봇이 뜬 뒤에 커맨드 한복판에서
 * undefined로 터지면 사용자에게는 "봇이 먹통"으로만 보인다. */

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`[env] ${name} 이(가) 없습니다. apps/bot/.env.example 을 참고해 .env 를 채우세요.`);
    process.exit(1);
  }
  return v;
}
function optional(name: string, fallback = ""): string {
  return process.env[name] || fallback;
}
function num(name: string, fallback: number): number {
  const v = process.env[name];
  if (!v) return fallback;
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export const env = {
  discordToken: required("DISCORD_TOKEN"),
  appId: required("DISCORD_APP_ID"),
  /** 개발 중에는 반드시 채운다(§A.7 길드 스코프 sync). 비면 전역 등록. */
  devGuildId: optional("DEV_GUILD_ID"),

  databaseUrl: required("DATABASE_URL"),
  pgSslMode: optional("PGSSLMODE"),
  /** verify-ca·verify-full 일 때 쓸 CA 인증서 파일 경로 */
  pgSslRootCert: optional("PGSSLROOTCERT"),
  /** "1일 3회"의 하루 경계 (Postgres 시간대 이름) */
  rollDayTz: optional("ROLL_DAY_TZ", "Asia/Seoul"),

  /** §F LLM — 전부 선택. baseUrl이 비면 템플릿만 쓴다. */
  llm: {
    baseUrl: optional("LLM_BASE_URL"),
    apiKey: optional("LLM_API_KEY"),
    model: optional("LLM_MODEL"),
    /** 이 값(상위 %)보다 희귀한 생에만 실시간 호출 */
    rarityTopPct: num("LLM_RARITY_TOP_PCT", 0.1),
    timeoutMs: num("LLM_TIMEOUT_MS", 8000),
  },
} as const;

export const llmEnabled = Boolean(env.llm.baseUrl && env.llm.model);
