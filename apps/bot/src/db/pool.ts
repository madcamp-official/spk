import fs from "node:fs";
import pg from "pg";
import { env } from "../env.js";

/* pg를 그대로 쓴다(ORM 없음). §A.5가 요구하는 원자적 쿼리
   — SEQUENCE 발급, 조건부 UPDATE ... WHERE + 반환 행 수 판정 —
   를 SQL 그대로 쓰는 게 가장 정확하고, 이 레포의 "의존성 최소" 기조와도 맞는다.

   numeric은 pg가 기본으로 문자열을 준다(정밀도 손실 방지). 우리 numeric 컬럼은
   전부 표시·비교용이라 숫자로 받는 편이 안전하다 — 안 고치면 rarity_score 정렬이
   문자열 비교가 되어 "0.9 > 0.1e-5" 같은 조용한 오정렬이 난다. */
pg.types.setTypeParser(pg.types.builtins.NUMERIC, (v: string) => Number(v));
/* bigint(출생 번호). JS number로 안전한 범위(2^53)를 한참 밑돌므로 숫자로 받는다. */
pg.types.setTypeParser(pg.types.builtins.INT8, (v: string) => Number(v));

/* PGSSLMODE 해석.
 *
 * ⚠ node-postgres는 libpq가 아니다. `ssl: {}` 를 주면 Node의 기본 검증(엄격)이 켜지는데,
 * libpq에서 `sslmode=require` 는 "암호화는 하되 인증서는 검증하지 않는다"는 뜻이다.
 * 이 차이를 무시하면 Supabase 풀러처럼 체인이 공개 CA로 안 이어지는 곳에서
 * SELF_SIGNED_CERT_IN_CHAIN 으로 막힌다. 그래서 libpq 의미에 맞춰 매핑한다.
 *
 * 진짜 검증(verify-ca/verify-full)을 하려면 CA 인증서가 필요하다 —
 * PGSSLROOTCERT 에 파일 경로를 주면 그것으로 검증한다. */
function sslConfig(): pg.ClientConfig["ssl"] {
  const mode = env.pgSslMode.trim().toLowerCase();
  if (!mode || mode === "disable") return undefined;
  if (mode === "verify-ca" || mode === "verify-full") {
    if (!env.pgSslRootCert) {
      console.error(`[db] PGSSLMODE=${mode} 에는 PGSSLROOTCERT(CA 파일 경로)가 필요합니다.`);
      process.exit(1);
    }
    return { rejectUnauthorized: true, ca: fs.readFileSync(env.pgSslRootCert, "utf8") };
  }
  /* require · prefer · no-verify — 암호화하되 인증서는 검증하지 않는다(libpq 의미) */
  return { rejectUnauthorized: false };
}

export const pool = new pg.Pool({
  connectionString: env.databaseUrl,
  ssl: sslConfig(),
  max: 10,
  idleTimeoutMillis: 30_000,
});

pool.on("error", (e) => console.error("[db] 유휴 커넥션 오류:", e.message));

/* ── DB 핸들 추상화 ──────────────────────────────────────────────
   queries.ts는 pg가 아니라 이 인터페이스에만 의존한다. 덕분에 Postgres 서버 없이도
   (WASM Postgres 같은) 다른 구현을 꽂아 마이그레이션과 원자적 쿼리를 실제로 돌려볼 수 있다.
   프로덕션 구현은 아래 pgDb 하나뿐이며, 트랜잭션은 반드시 한 커넥션에 묶는다 —
   풀에서 매번 다른 커넥션을 집으면 BEGIN과 COMMIT이 서로 다른 세션에서 돈다. */
export interface QueryResult<R> { rows: R[]; rowCount: number | null }
export interface Queryable {
  query<R = any>(sql: string, params?: unknown[]): Promise<QueryResult<R>>;
}
export interface Db extends Queryable {
  /** 콜백 안의 쿼리는 전부 한 트랜잭션·한 커넥션에서 돈다. 던지면 롤백된다. */
  withTx<T>(fn: (tx: Queryable) => Promise<T>): Promise<T>;
}

const pgDb: Db = {
  query: (sql, params) => pool.query(sql, params as any[]) as any,
  async withTx(fn) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const out = await fn({ query: (s, p) => client.query(s, p as any[]) as any });
      await client.query("COMMIT");
      return out;
    } catch (e) {
      await client.query("ROLLBACK");
      throw e;
    } finally {
      client.release();
    }
  },
};

let current: Db = pgDb;
export const db: Db = {
  query: (sql, params) => current.query(sql, params),
  withTx: (fn) => current.withTx(fn),
};
/** 검증용으로 다른 구현을 꽂는다. 프로덕션 경로에서는 호출하지 않는다. */
export function setDb(d: Db): void { current = d; }

export async function closePool(): Promise<void> {
  await pool.end();
}
