/* 공용 헬퍼: DOM 단축, 난수원, 숫자 포맷
 *
 * 난수원(mulberry32·strHash·setRNG)은 packages/core로 옮겼지만 여기서 다시
 * 내보낸다 — RNG 싱글턴을 하나로 유지하기 위해서다. fortune.js가 setRNG로
 * 날짜 시드를 꽂은 동안 core의 rollLife()가 같은 난수원을 봐야 "오늘의 운세"가
 * 하루 고정된다. 재수출은 같은 모듈 인스턴스를 가리키므로 이 보장이 유지된다
 * (복사하면 깨진다). isoCode도 여러 모듈이 이 파일을 통해 가져다 쓴다.
 *
 * 여기 남은 것은 브라우저에 묶인 것들뿐이다: DOM($), 환경 감지(reduceMotion·isAutomated),
 * 그리고 i18n이 런타임에 문구를 갈아끼우는 표시 포맷(L·fmtPct·fmtTop·fmtUSD·koNum). */
export {setRNG,mulberry32,strHash,isoCode}
 from "../../core/util.js";

export const $=id=>document.getElementById(id);
/* 서버(node)도 이 파일을 import한다(server/counter.js) — 여기서 matchMedia·navigator를
   맨몸으로 부르면 서버가 뜨다가 죽는다. $는 화살표 함수라 import 시점에 실행되지 않아
   괜찮지만, 아래 두 줄은 그 자리에서 실행되므로 typeof 가드가 필요하다. */
export const reduceMotion=typeof matchMedia!=="undefined"&&matchMedia("(prefers-reduced-motion: reduce)").matches;
/* 헤드리스 자동화(배포 검증 스크립트 등)는 사람이 아니다. 항상 버튼을 누르고 수십 번씩
   굴려서 활성화율·세션당 리롤·공유수를 통째로 왜곡한다. 화면 동작은 그대로 두고
   서버로 보내는 것만 건너뛴다 — 분석 스니펫(gtag 등)은 그대로 발화하므로
   자동화 테스트는 여전히 이벤트 발생을 확인할 수 있다. */
export const isAutomated=typeof navigator!=="undefined"&&navigator.webdriver===true;
export function koNum(n){ /* 큰 수를 한국어 단위로 */
 if(n>=1e8)return (n/1e8).toFixed(n>=3e8?0:1).replace(/\.0$/,"")+"억";
 if(n>=1e4)return Math.round(n/1e4).toLocaleString()+"만";
 return Math.round(n).toLocaleString();}
/* 포맷 함수 속 표시용 문구. core는 i18n을 모르므로(플랫폼 무관) 이 표시 계층은 웹에 남는다 —
   i18n.js(클라이언트 전용)가 로드 시점에 현재 언어의 문구로 덮어쓴다. */
export const L={pctLess:"0.0001% 미만",topWithin:"0.1% 이내"};
export function fmtPct(p){const pct=p*100;
 if(pct>=1)return pct.toFixed(1)+"%";
 if(pct>=0.01)return pct.toFixed(2)+"%";
 if(pct>=0.0001)return pct.toFixed(Math.min(6,1-Math.floor(Math.log10(pct))))+"%";
 return L.pctLess;}
/* 등급 대신 확률(%)을 이벤트에 싣는다. 희귀한 생일수록 공유가 터지는지 볼 수 있어야 한다. */
export function probPct(p){return +(p*100).toFixed(4);}
/* 소득 상위 % 표시: 반올림으로 "상위 100%"/"상위 0.0%"가 나오지 않게 캡 */
export function fmtTop(t){if(t<0.1)return L.topWithin;if(t<1)return t.toFixed(1)+"%";return Math.min(99,Math.round(t))+"%";}
export function fmtUSD(v){ /* 유효숫자 3자리 반올림: $2,430 / $47,800 처럼 읽히게 */
 const mag=Math.pow(10,Math.max(0,Math.floor(Math.log10(Math.max(v,1)))-2));
 return "$"+(Math.round(v/mag)*mag).toLocaleString();}
