/* 로컬 개발 서버 (의존성 0)
 *
 * apps/web 을 그대로 서빙한다 — 프로덕션에서 nginx가 /var/www/life-reroll 을 서빙하는 것과
 * 같은 트리 모양이다. core(packages/core/dist)는 빌드 때 apps/web/core 로 복사되므로
 * (tools/sync-core.mjs) 여기서 특별 취급하지 않는다. 그래야 "로컬에선 되는데 배포하면
 * 깨지는" 경로 차이가 아예 생기지 않는다.
 *
 * 웹은 번들러가 없어 브라우저가 import를 URL로 푼다. 그래서 웹 모듈은
 * `../../core/roll.js` 같은 **상대 경로**로 core를 부른다(절대 /core/ 를 쓰면
 * lab.sh가 /lab/ 하위에 얹을 때 실험판이 프로덕션 core를 물어 격리가 깨진다).
 *
 * 사용:  npm run dev   [PORT=8791]
 */
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WEB = path.join(ROOT, "apps", "web");
const PORT = Number(process.env.PORT) || 8791;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".woff2": "font/woff2",
  ".txt": "text/plain; charset=utf-8",
  ".svg": "image/svg+xml",
};

const server = http.createServer((req, res) => {
  const clean = decodeURIComponent((req.url || "/").split("?")[0].split("#")[0]);
  const rel = path.normalize(clean).replace(/^([/\\])+/, "");
  /* 경로 이탈 차단 */
  if (rel.split(path.sep).includes("..")) { res.writeHead(403).end("forbidden"); return; }

  let file = path.join(WEB, rel === "" ? "index.html" : rel);
  if (!file.startsWith(WEB)) { res.writeHead(403).end("forbidden"); return; }
  if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, "index.html");

  if (!fs.existsSync(file)) {
    /* core가 통째로 없으면 빌드를 잊은 것이다 — 원인을 바로 말해 준다 */
    const hint = rel.startsWith("core") && !fs.existsSync(path.join(WEB, "core"))
      ? "  ← apps/web/core 없음: `npm run build:core` 먼저"
      : "";
    res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
    res.end("404 " + req.url + hint);
    console.log("404", req.url, hint);
    return;
  }
  res.writeHead(200, {
    "content-type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream",
    /* 개발 중에는 항상 최신을 본다. 프로덕션 nginx의 .js no-cache 규칙과 같은 취지. */
    "cache-control": "no-store",
  });
  res.end(fs.readFileSync(file));
});

server.listen(PORT, "127.0.0.1", () => {
  const ok = fs.existsSync(path.join(WEB, "core"));
  console.log(`  웹  http://127.0.0.1:${PORT}/   ← apps/web${ok ? "" : "  (core 없음! npm run build:core)"}`);
});
