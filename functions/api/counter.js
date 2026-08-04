import { json } from "./_lib.js";

/* GET /api/counter -> {"total":N} */
export async function onRequestGet({ env }) {
  const row = await env.DB.prepare("SELECT total FROM counter WHERE id = 1").first();
  return json(200, { total: (row && row.total) || 0 });
}
