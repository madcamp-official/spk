/* 마이그레이션 러너 (의존성 0)
 *
 *   pnpm -F @life-reroll/bot migrate
 *
 * migrations/ 의 .sql 을 파일명 순서대로 한 번씩 실행하고 schema_migrations 에 기록한다.
 * 각 파일은 하나의 트랜잭션에서 돈다 — 중간에 실패하면 그 파일은 통째로 롤백되므로
 * 반쯤 적용된 스키마가 남지 않는다. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { pool, closePool } from "./pool.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
/* 빌드하면 dist/db/ 로 가는데 .sql 은 컴파일 대상이 아니라 src에 남는다 —
   빌드본과 소스 양쪽에서 찾는다. */
const CANDIDATES = [
  path.join(HERE, "migrations"),
  path.join(HERE, "..", "..", "src", "db", "migrations"),
];

async function main(): Promise<void> {
  const dir = CANDIDATES.find(d => fs.existsSync(d));
  if (!dir) {
    console.error("[migrate] migrations 디렉터리를 찾지 못했습니다:", CANDIDATES);
    process.exit(1);
  }

  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);

  const done = new Set(
    (await pool.query<{ name: string }>("SELECT name FROM schema_migrations")).rows.map(r => r.name));
  const files = fs.readdirSync(dir).filter(f => f.endsWith(".sql")).sort();

  let applied = 0;
  for (const f of files) {
    if (done.has(f)) { console.log(`  = ${f} (이미 적용됨)`); continue; }
    const sql = fs.readFileSync(path.join(dir, f), "utf8");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [f]);
      await client.query("COMMIT");
      console.log(`  + ${f}`);
      applied++;
    } catch (e) {
      await client.query("ROLLBACK");
      console.error(`  ! ${f} 실패 — 롤백했습니다:`, (e as Error).message);
      throw e;
    } finally {
      client.release();
    }
  }
  console.log(applied ? `[migrate] ${applied}개 적용 완료` : "[migrate] 변경 없음 (최신)");
}

main().then(closePool).catch(async (e) => { console.error(e); await closePool(); process.exit(1); });
