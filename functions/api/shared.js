import { json, sign } from "./_lib.js";

/* GET /api/shared?s=code -> {l, sig}  (없으면 404)
 * sig 를 다시 붙여 주는 건 받는 쪽 코드가 기존 검증 경로를 그대로 타게 하기 위해서다. */
export async function onRequestGet({ request, env }) {
  const code = String(new URL(request.url).searchParams.get("s") || "");
  if (!/^[A-Za-z0-9]{7}$/.test(code)) return json(404, { error: "not found" });
  const row = await env.DB.prepare("SELECT l FROM shares WHERE code = ?1").bind(code).first();
  if (!row) return json(404, { error: "not found" });
  return json(200, { l: row.l, sig: env.LIFE_SECRET ? await sign(env, row.l) : "" });
}
