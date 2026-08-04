import { json, readBody, clientIp, ipHash, counterIncLimited, MAX_N } from "../_lib.js";

/* POST /api/counter/inc  body {n} -> {"total":N+n}
 * 클라이언트는 증가분을 모아 유휴/이탈 때 sendBeacon 하나로 보낸다(IMPROVEMENT_LOG #13).
 * 몸통 없는 옛 클라이언트도 n=1 로 동작한다(하위호환).
 * 배치 하나가 감당할 최대 리롤 수까지만 인정한다 — 몸통을 조작해 total 을 몰아 올리는 걸 막는다. */
export async function onRequestPost({ request, env }) {
  const body = await readBody(request, 256);
  if (body === null) return new Response(null, { status: 413 });
  let n = 1;
  if (body) {
    try {
      const parsed = JSON.parse(body);
      if (parsed && Number.isFinite(parsed.n)) n = parsed.n;
    } catch (_) { /* 파싱 실패 → n=1 폴백 */ }
  }
  n = Math.max(1, Math.min(Math.floor(n) || 1, MAX_N * 10));
  const h = await ipHash(env, clientIp(request));
  if (counterIncLimited(h, n)) {
    const row = await env.DB.prepare("SELECT total FROM counter WHERE id = 1").first();
    return json(429, { total: (row && row.total) || 0 });
  }
  const row = await env.DB.prepare("UPDATE counter SET total = total + ?1 WHERE id = 1 RETURNING total").bind(n).first();
  return json(200, { total: (row && row.total) || 0 });
}
