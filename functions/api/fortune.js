import { json, sign, clientIp, ipHash, rollLimited } from "./_lib.js";
/* ⚠ 반드시 apps/web/core/ — roll.js 의 주석 참고(두 벌 번들 사고 방지) */
import { rollLife } from "../../apps/web/core/roll.js";
import { setRNG, mulberry32, strHash } from "../../apps/web/core/util.js";
import { encodeLife } from "../../apps/web/app/engine/permalink.js";

/* GET /api/fortune?dev=..&key=YYYY-MM-DD -> {l,sig}  (날짜+기기 시드라 하루 동안 같은 값)
 * 클라이언트의 '오늘'은 기기 시간대 기준이라 ±36h 만 받는다 — 아무 날짜나 받아주면
 * 날짜를 갈아가며 희귀한 운세를 낚을 수 있다. */
function nearToday(key) {
  const [y, m, d] = key.split("-").map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  return Math.abs(Date.UTC(y, m - 1, d) - Date.now()) <= 36 * 3600 * 1000;
}

export async function onRequestGet({ request, env }) {
  if (!env.LIFE_SECRET) return json(503, { error: "unavailable" });
  const q = new URL(request.url).searchParams;
  const dev = String(q.get("dev") || ""), key = String(q.get("key") || "");
  if (!/^[a-z0-9]{1,16}$/i.test(dev)) return json(400, { error: "bad dev" });
  if (!/^\d{4}-\d{1,2}-\d{1,2}$/.test(key) || !nearToday(key)) return json(400, { error: "bad key" });
  if (rollLimited(await ipHash(env, clientIp(request)), 1)) return json(429, { error: "slow down" });
  /* setRNG 는 util.js 모듈 전역이다. 아래 구간에 await 가 없어야 같은 격리의 다른 요청이
     끼어들지 못한다 — 하나라도 넣으면 남의 운세가 내 시드로 뽑힌다(VM 과 같은 규칙). */
  const rng = mulberry32(strHash(key + "|" + dev));
  let l;
  setRNG(rng);
  try { l = encodeLife(rollLife()); } finally { setRNG(Math.random); }
  return json(200, { l, sig: await sign(env, l) });
}
