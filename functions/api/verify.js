import { json, sigOK, clientIp, ipHash, rollLimited } from "./_lib.js";

/* GET /api/verify?l=..&sig=.. -> {"ok":true|false} */
export async function onRequestGet({ request, env }) {
  if (!env.LIFE_SECRET) return json(503, { error: "unavailable" });
  const q = new URL(request.url).searchParams;
  if (rollLimited(await ipHash(env, clientIp(request)), 1)) return json(429, { error: "slow down" });
  return json(200, { ok: await sigOK(env, String(q.get("l") || ""), String(q.get("sig") || "")) });
}
