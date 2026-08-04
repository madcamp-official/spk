import { json } from "../_lib.js";

/* GET /api/counter/health -> {ok,total,roll,signing}
 * roll 은 VM 에선 "뽑기 모듈이 로드됐나"였다 — 여기서는 번들에 정적으로 들어 있으므로
 * 서명 키 유무가 곧 /api/roll 가용성이다. */
export async function onRequestGet({ env }) {
  const row = await env.DB.prepare("SELECT total FROM counter WHERE id = 1").first();
  return json(200, {
    ok: true,
    total: (row && row.total) || 0,
    roll: !!env.LIFE_SECRET,
    signing: !!env.LIFE_SECRET,
  });
}
