/* D1 → events.jsonl 수집기 (analyze.py 의 앞단)
 *
 * VM 시절엔 events.jsonl 을 scp 로 내려받았다. Pages 이전 후 이벤트는 D1 에 쌓이므로
 * 이 스크립트가 같은 모양의 JSONL 로 내려준다 — analyze.py 는 한 줄도 안 고치고 그대로 쓴다.
 *
 *   node tools/fetch-events.mjs                                 # D1 전체 → ./events.jsonl
 *   node tools/fetch-events.mjs --since 2026-08-05              # 그 날짜(KST)부터만
 *   node tools/fetch-events.mjs --merge <백업>/events.jsonl.gz  # VM 시절 로그와 병합
 *   node tools/fetch-events.mjs --local                         # 원격 대신 로컬 D1 (wrangler dev 용)
 *   python3 tools/analyze.py events.jsonl                       # 그다음 이걸로 분석
 *
 * ⚠ 2026-08-02(VM 마지막 백업) 이후의 dwell·roll 은 어디에도 없다 — Pages 의 track 이
 *   저장하지 않기로 한 설계다(docs/CLOUDFLARE-PAGES.md). analyze.py 의 dwell·리롤 리듬·
 *   결과 분포 절은 그 이전 데이터(--merge 로 병합한 백업)만 반영된다. 나머지 지표
 *   (퍼널·채널·A/B·바이럴·제안)는 계속 쌓인다. 리롤 총량은 /api/counter 가 정답이다.
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import zlib from "node:zlib";

const args = process.argv.slice(2);
const opt = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const merges = [];
for (let i = 0; i < args.length; i++) if (args[i] === "--merge" && args[i + 1]) merges.push(args[++i]);
const since = opt("--since");
const out = opt("--out") || "./events.jsonl";
const target = args.includes("--local") ? "--local" : "--remote";

/* KST 자정 경계 — counter 솔트·analyze.py day_of 와 같은 기준(어긋나면 고유 방문자가 부풀려진다) */
let where = "";
if (since) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(since)) { console.error("--since 는 YYYY-MM-DD"); process.exit(1); }
  const ms = Date.parse(since + "T00:00:00+09:00");
  where = ` WHERE t >= ${ms}`;
}

console.error(`D1(${target.slice(2)}) 에서 이벤트 조회 중…`);
/* SELECT 는 --command 로만 결과를 돌려준다(--file 은 원격에서 import 경로를 타서
   실행 통계만 온다). Windows 는 npx 가 .cmd 라 셸을 거쳐야 하고, 셸에 안전하게
   넘기려면 문자열을 직접 인용해 조립한다 — SQL 에 큰따옴표가 없음을 전제한다. */
const sql = `SELECT t, e, p, ip_h FROM events${where} ORDER BY t`;
if (sql.includes('"')) { console.error("SQL 에 큰따옴표 불가"); process.exit(1); }
const raw = execSync(
  `npx wrangler d1 execute life-reroll ${target} --command "${sql}" --json`,
  { encoding: "utf8", maxBuffer: 1024 * 1024 * 512 });
/* wrangler 가 JSON 앞에 배너를 섞을 수 있어 첫 '[' 부터 파싱한다 */
const results = JSON.parse(raw.slice(raw.indexOf("[")))[0].results || [];

/* VM 의 events.jsonl 과 같은 줄 모양으로: {"t":…,"e":…,"p":{…},"ip_h":…} */
const d1Lines = results.map(r => {
  let p = {};
  try { p = JSON.parse(r.p) || {}; } catch (_) {}
  return JSON.stringify({ t: r.t, e: r.e, p, ip_h: r.ip_h });
});

/* 병합: 백업(.gz 또는 평문)을 앞에, D1 을 뒤에 — 시간순이 대체로 유지된다.
   analyze.py 는 줄 순서에 의존하지 않으므로(날짜 버킷) 정확한 정렬은 불필요하다. */
const chunks = [];
let mergedCount = 0;
for (const m of merges) {
  let buf = fs.readFileSync(m);
  if (m.endsWith(".gz")) buf = zlib.gunzipSync(buf);
  let text = buf.toString("utf8");
  if (since) {
    const ms = Date.parse(since + "T00:00:00+09:00");
    text = text.split("\n").filter(l => {
      if (!l) return false;
      try { return JSON.parse(l).t >= ms; } catch (_) { return false; }
    }).join("\n");
    if (text) text += "\n";
  } else if (text && !text.endsWith("\n")) text += "\n";
  mergedCount += text ? text.split("\n").filter(Boolean).length : 0;
  chunks.push(text);
}
chunks.push(d1Lines.join("\n") + (d1Lines.length ? "\n" : ""));
fs.writeFileSync(out, chunks.join(""));
console.error(`완료: D1 ${d1Lines.length.toLocaleString()}건`
  + (merges.length ? ` + 백업 ${mergedCount.toLocaleString()}건` : "")
  + ` → ${out}`);
console.error(`다음: python3 tools/analyze.py ${out}`);
