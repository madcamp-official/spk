/* packages/core/dist → apps/web/core 복사
 *
 * 왜 복사하는가: 웹은 번들러가 없어서 브라우저도 node도 core를 **경로**로 찾는다.
 *   브라우저: /app/ui/render.js 의 `../../core/roll.js`  → /core/roll.js
 *   node    : server/counter.js가 permalink.js를 import → 그 안의 `../../core/data.js`
 * 배포 트리(/var/www/life-reroll/{app,core})가 이 모양이라, 로컬도 같은 모양이어야
 * "로컬에선 되는데 배포하면 깨지는" 차이가 안 생긴다. pnpm 심볼릭 링크는 브라우저에
 * 보이지 않으므로 대안이 되지 못한다.
 *
 * apps/web/core 는 빌드 산출물이라 .gitignore에 있다. 커밋되는 정본은 packages/core/dist.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "packages", "core", "dist");
const DST = path.join(ROOT, "apps", "web", "core");

if (!fs.existsSync(SRC)) {
  console.error(`[sync-core] ${SRC} 없음 — 먼저 빌드하세요 (npm run build:core)`);
  process.exit(1);
}
fs.rmSync(DST, { recursive: true, force: true });
fs.cpSync(SRC, DST, { recursive: true });
const n = fs.readdirSync(DST).filter(f => f.endsWith(".js")).length;
console.log(`[sync-core] ${n}개 모듈 → apps/web/core`);
