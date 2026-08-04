/* VM 백업 → D1 시드 SQL 생성기
 *
 *   node tools/make-d1-seed.mjs <shares.jsonl 경로> <카운터 값>
 *
 * 카운터 값은 컷오버 직전의 라이브 값을 쓴다:
 *   curl -s https://life-reroll.com/api/counter
 * VM 이 아직 트래픽을 받는 동안 만든 시드는 낡은 값이므로, 도메인을 옮기기 직전에
 * 이 스크립트를 다시 돌려 seed.sql 을 갱신하고 적용해야 한 건도 안 새 나간다.
 *
 * 출력: server/d1/seed.sql  (커밋한다 — 공유 코드·생 문자열은 공개 URL 에 이미 실렸던 값이라
 * 비밀이 아니다. LIFE_SECRET 같은 비밀은 여기 절대 넣지 않는다.)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const [sharesPath, totalArg] = process.argv.slice(2);
const total = Math.floor(Number(totalArg));
if (!sharesPath || !Number.isFinite(total) || total < 0) {
  console.error("사용법: node tools/make-d1-seed.mjs <shares.jsonl> <카운터값>");
  process.exit(1);
}

const esc = s => "'" + String(s).replace(/'/g, "''") + "'";
const lines = fs.readFileSync(sharesPath, "utf8").split("\n").filter(Boolean);
const rows = [];
for (const line of lines) {
  try {
    const r = JSON.parse(line);
    /* counter.js(handleShare)가 저장하던 형태 그대로: 코드 base62 7자, l 최대 64자 */
    if (r && typeof r.c === "string" && /^[A-Za-z0-9]{7}$/.test(r.c)
        && typeof r.l === "string" && r.l.length <= 64) rows.push(r);
  } catch (_) {}
}

const out = [
  "-- 자동 생성: tools/make-d1-seed.mjs — 손으로 고치지 말 것",
  `-- 원본: ${path.basename(sharesPath)} (${rows.length}건) · 카운터 ${total}`,
  `-- 생성 시각: ${new Date().toISOString()}`,
  "",
  "-- 컷오버 때 더 큰 값으로 다시 실행해도 안전하다 — max() 라 값이 뒤로 가지 않는다.",
  `UPDATE counter SET total = max(total, ${total}) WHERE id = 1;`,
  "",
  ...rows.map(r => `INSERT OR IGNORE INTO shares (code, l) VALUES (${esc(r.c)}, ${esc(r.l)});`),
  "",
];
const dest = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "server", "d1", "seed.sql");
fs.writeFileSync(dest, out.join("\n"));
console.log(`seed.sql 생성: 카운터 ${total.toLocaleString()} · 공유 코드 ${rows.length}건 → ${dest}`);
