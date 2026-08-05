/* Discord 봇의 DB 접근 — apps/bot/src/db/pool.ts 의 Workers 이식본.
 *
 * VM 봇은 상주 프로세스라 pg.Pool 을 들고 있었다. Workers 는 요청 단위 수명이라
 * **인터랙션 하나 = 커넥션 하나**다: 처음 쿼리할 때 붙이고, 요청이 끝나면 end() 한다.
 * Supabase 풀러(session 모드)가 그 바깥의 진짜 풀 역할을 한다.
 *
 * ⚠ 드라이버는 node-postgres(pg)가 아니라 postgres.js 다. pg 는 nodejs_compat 아래에서
 *   node:net/node:tls 경로를 타는데 workerd 의 tls 구현이 불완전해 SSL 업그레이드에서
 *   "Connection terminated unexpectedly" 로 죽는다 — 로컬·프로덕션 양쪽에서 실제로 겪었다.
 *   postgres.js 는 workerd 를 감지해 cloudflare:sockets 를 직접 쓴다.
 *
 * queries.js 는 pg 모양의 인터페이스({rows, rowCount})만 본다 — 드라이버 차이는 여기서 끝난다.
 * 트랜잭션 규약(§A.5)은 그대로: sql.begin 이 한 커넥션에 BEGIN/COMMIT 을 묶는다. */
import postgres from "postgres";

const wrap = (sql) => ({
  async query(text, params = []) {
    const r = await sql.unsafe(text, params);
    return { rows: [...r], rowCount: r.count ?? r.length };
  },
});

export function makeDb(env) {
  let sql = null;
  function get() {
    if (!sql) {
      /* Hyperdrive 바인딩이 정본이다. workerd 가 Supabase 에 TLS 를 직접 열면 드라이버가
         연결 루프에 빠진다(위 주석) — Hyperdrive 로컬 바인딩에는 평문으로 붙고,
         원본까지의 TLS 는 Cloudflare 가 맡는다. DATABASE_URL 은 하위호환 폴백일 뿐이다. */
      const viaHyperdrive = Boolean(env.HYPERDRIVE?.connectionString);
      sql = postgres(viaHyperdrive ? env.HYPERDRIVE.connectionString : env.DATABASE_URL, {
        /* 요청 하나가 쓸 커넥션 하나 — 동시 쿼리(getDeck 의 Promise.all)는
           postgres.js 가 같은 커넥션에 파이프라인으로 흘린다. */
        max: 1,
        /* 직결 폴백일 때만 TLS(PGSSLMODE=require 의 libpq 의미 — pool.ts 참조) */
        ...(viaHyperdrive ? {} : { ssl: { rejectUnauthorized: false } }),
        /* 풀러 뒤에서는 이름 있는 prepared statement 가 세션에 묶여 깨질 수 있다 */
        prepare: false,
        /* pg 판(pool.ts)과 같은 타입 규약: bigint(출생 번호)·numeric(희귀도)을 숫자로.
           기본값(문자열)이면 id.toLocaleString() 이 깨지고 rarity 정렬·비교가 어긋난다. */
        types: {
          bigint: { to: 20, from: [20], parse: (v) => Number(v), serialize: (v) => String(v) },
          numeric: { to: 1700, from: [1700], parse: (v) => Number(v), serialize: (v) => String(v) },
        },
      });
    }
    return sql;
  }
  return {
    query: (text, params) => wrap(get()).query(text, params),
    /** 콜백 안의 쿼리는 전부 한 트랜잭션에서 돈다. 던지면 롤백된다. */
    withTx(fn) {
      return get().begin((tx) => fn(wrap(tx)));
    },
    /** 요청이 끝날 때 반드시 부른다(waitUntil) — 안 닫으면 풀러 슬롯이 샌다. */
    async end() {
      if (!sql) return;
      const s = sql;
      sql = null;
      try { await s.end({ timeout: 5 }); } catch { /* 이미 끊김 */ }
    },
  };
}
