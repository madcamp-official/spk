/* 전 라우트 미들웨어 — 단 _routes.json 이 함수 호출 자체를 /api/* 와 HTML 경로 몇 개로
 * 좁혀 두었다. 이 절임이 없으면 정적 자산 하나하나가 함수 호출을 태워서(방문 1회 ≈ 자산 20개)
 * 무료 호출 한도(10만/일)가 순식간에 샌다. 새 HTML 경로를 만들면 _routes.json 에도 넣을 것.
 *
 * 여기서 하는 일은 geo 쿠키 하나다. nginx 가 하던
 *   add_header Set-Cookie "geo=$http_cf_ipcountry; ..."
 * 의 재현 — i18n.js 가 첫 렌더 전에 이 쿠키로 표시 언어를 고른다(KR→한국어, JP→일본어 …).
 * 없으면 브라우저 언어와 무관하게 영어로 떨어진다. */
export async function onRequest(context) {
  const { request, next } = context;
  const url = new URL(request.url);
  if (url.pathname.startsWith("/api/")) return next();

  const res = await next();
  const country = request.headers.get("cf-ipcountry")
    || (request.cf && request.cf.country) || "";
  if (!/^[A-Z]{2}$/.test(country)) return res;

  const out = new Response(res.body, res);
  out.headers.append("set-cookie", `geo=${country}; Path=/; Max-Age=86400; SameSite=Lax`);
  return out;
}
