import { json } from "./_lib.js";

/* GET /api/recent?n=12 -> {"rolls":[{c,ago,i}, ...]}
 * VM 의 메모리 링 버퍼 대신 D1 의 recent_rolls(track.js 가 1/20 샘플로 채움)를 읽는다.
 * ago(초)는 서버가 계산한다 — 클라 시계가 틀어져 있어도 "N초 전"이 안 어긋난다. */
const RECENT_MAX = 30;

export async function onRequestGet({ request, env }) {
  let n = Math.floor(Number(new URL(request.url).searchParams.get("n")));
  if (!Number.isFinite(n) || n < 1) n = 12;
  n = Math.min(n, RECENT_MAX);
  const { results } = await env.DB.prepare(
    "SELECT id, c, t FROM recent_rolls ORDER BY id DESC LIMIT ?1").bind(n).all();
  const now = Date.now();
  const rolls = (results || []).map(r => ({ c: r.c, ago: Math.max(0, Math.round((now - r.t) / 1000)), i: r.id }));
  return json(200, { rolls });
}
