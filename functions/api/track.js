import { json, readBody, clientIp, ipHash, trackLimited } from "./_lib.js";

/* POST /api/track -> 204
 *
 * VM 은 events.jsonl 에 전량 append 했다. D1 에서는 **dwell·roll 을 저장하지 않는다** —
 * 둘이 전체의 98%(피크 30만/일)라 무료 쓰기 한도(10만 행/일)를 3배 넘긴다. 나머지 23종
 * (visit·activate·share_*·suggest·exit …)은 피크 8.6천/일로 여유가 크고, 실제 분석
 * (A/B 승패·활성화율·바이럴 계수·제안함·세션당 리롤)은 전부 그 2%에서 나왔다.
 * 잃는 것은 dwell 분포 하나다 — 필요해지면 여기서 샘플링으로 되살린다.
 *
 * roll 은 저장 대신 실시간 피드 버퍼(recent_rolls)에 1/20 샘플로만 흘린다.
 * VM 의 봇 필터(주기적 리롤 감지)는 기기별 간격 이력이 필요한 상태 기계라 무상태 Workers
 * 에서는 뺐다 — 관측된 봇은 60초 정주기였고 1/20 샘플링이면 피드 점유가 미미하다. */
const BULK = new Set(["dwell", "roll"]);
const MAX_BATCH = 50;
const ROLL_SAMPLE = 20;        /* roll 1/20 만 피드에 */
const RECENT_KEEP = 60;        /* 피드 버퍼 행 수 상한 */

export async function onRequestPost(context) {
  const { request, env } = context;
  const body = await readBody(request);
  if (body === null) return new Response(null, { status: 413 });

  /* VM 처럼 응답을 먼저 확정하고 뒤에서 쓴다 — sendBeacon 은 응답을 안 보지만
     여기서 오래 잡고 있으면 함수 실행 시간만 태운다. */
  const work = (async () => {
    let parsed;
    try { parsed = JSON.parse(body); } catch (_) { return; }
    const events = (Array.isArray(parsed) ? parsed : [parsed]).slice(0, MAX_BATCH);
    if (!events.length) return;
    const h = await ipHash(env, clientIp(request));
    if (trackLimited(h, events.length)) return;
    const now = Date.now();

    const stmts = [];
    const insEvent = env.DB.prepare("INSERT INTO events (t, e, p, ip_h) VALUES (?1, ?2, ?3, ?4)");
    const insRoll = env.DB.prepare("INSERT INTO recent_rolls (c, t) VALUES (?1, ?2)");
    for (const ev of events) {
      const e = String((ev && ev.e) || "").slice(0, 32);
      if (!e) continue;
      const p = (ev && ev.p && typeof ev.p === "object") ? ev.p : {};
      if (!BULK.has(e)) stmts.push(insEvent.bind(now, e, JSON.stringify(p), h));
      if (e === "roll") {
        const c = typeof p.country === "string" ? p.country.slice(0, 40) : "";
        if (c && Math.floor(Math.random() * ROLL_SAMPLE) === 0) stmts.push(insRoll.bind(c, now));
      }
    }
    /* 피드 버퍼 청소는 가끔만 — 매번 하면 DELETE 가 roll 샘플보다 많아진다 */
    if (Math.floor(Math.random() * 50) === 0) {
      stmts.push(env.DB.prepare(
        "DELETE FROM recent_rolls WHERE id NOT IN (SELECT id FROM recent_rolls ORDER BY id DESC LIMIT ?1)"
      ).bind(RECENT_KEEP));
    }
    if (stmts.length) await env.DB.batch(stmts);
  })().catch(() => { /* 잘못된 요청·일시 오류는 조용히 버린다 (VM 과 동일) */ });

  context.waitUntil(work);
  return new Response(null, { status: 204 });
}
