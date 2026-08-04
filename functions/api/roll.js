import { json, sign, clientIp, ipHash, rollLimited, MAX_N } from "./_lib.js";
import { rollLife } from "../../apps/web/core/roll.js";
import { encodeLife } from "../../apps/web/app/engine/permalink.js";

/* GET /api/roll?n=20 -> {"lives":[{l,sig}, ...]}
 *
 * VM 과 같은 원칙: 서명이 뜻을 가지려면 서명하는 쪽이 값을 직접 만들어야 한다.
 * 뽑기 로직은 클라이언트와 **같은 소스**를 번들한다.
 *
 * ⚠ core 는 반드시 apps/web/core/ 쪽을 import 한다 — permalink.js 가 상대경로로 무는
 * 그 사본이다. packages/core/dist 를 물면 번들에 core 가 두 벌 들어가 rand/setRNG 의
 * 모듈 전역이 갈라진다(운세가 비결정이 되는 실제 사고가 있었다). 그래서 함수 번들 전에
 * build:core 가 돌아 있어야 한다 — Pages 는 빌드 명령 → 함수 번들 순서라 자동 충족,
 * 로컬 wrangler pages dev 는 직접 npm run build:core 를 먼저 돌린다. */
export async function onRequestGet({ request, env }) {
  if (!env.LIFE_SECRET) return json(503, { error: "unavailable" });
  const q = new URL(request.url).searchParams;
  const n = Math.min(MAX_N, Math.max(1, Math.floor(Number(q.get("n"))) || 1));
  if (rollLimited(await ipHash(env, clientIp(request)), n)) return json(429, { error: "slow down" });
  const lives = [];
  for (let i = 0; i < n; i++) {
    const l = encodeLife(rollLife());
    lives.push({ l, sig: await sign(env, l) });
  }
  return json(200, { lives });
}
