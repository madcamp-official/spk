import { json, readBody, sigOK, clientIp, ipHash, rollLimited, newCode } from "./_lib.js";

/* POST /api/share  body {l, sig} -> {code}
 * 서명이 유효한 생만 저장한다 — 코드로 꺼낸 생은 다시 검증할 필요가 없다(저장됐다는 것이
 * 곧 서버가 뽑았다는 증거). base62 7자 = 62^7 ≈ 3.5조이라 충돌은 사실상 없지만,
 * INSERT 가 UNIQUE 에 걸리면 다시 뽑는다(VM 의 do-while 대응). */
export async function onRequestPost({ request, env }) {
  if (!env.LIFE_SECRET) return json(503, { error: "unavailable" });
  if (rollLimited(await ipHash(env, clientIp(request)), 1)) return json(429, { error: "slow down" });
  const body = await readBody(request);
  if (body === null) return new Response(null, { status: 413 });
  let l, sig;
  try { const j = JSON.parse(body); l = String(j.l || ""); sig = String(j.sig || ""); }
  catch (_) { return json(400, { error: "bad json" }); }
  if (l.length > 64 || !(await sigOK(env, l, sig))) return json(400, { error: "bad life" });
  for (let attempt = 0; attempt < 3; attempt++) {
    const code = newCode();
    const r = await env.DB.prepare("INSERT OR IGNORE INTO shares (code, l) VALUES (?1, ?2)").bind(code, l).run();
    if (r.meta.changes === 1) return json(200, { code });
  }
  return json(500, { error: "retry" });
}
