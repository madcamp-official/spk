/* GET /api/up — 도메인 통합 폴백용 헬스 체크(index.html 인라인 스크립트가 부른다).
 * ACAO 는 옛 도메인이 교차출처로 찌를 수 있게 하기 위한 것. VM 시절과 응답이 같다. */
export function onRequestGet() {
  return new Response('{"ok":true}', {
    headers: {
      "content-type": "application/json",
      "cache-control": "no-store",
      "access-control-allow-origin": "*",
    },
  });
}
