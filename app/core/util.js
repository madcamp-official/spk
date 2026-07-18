/* 공용 헬퍼: DOM 단축, 난수원, 숫자 포맷 */
export const $=id=>document.getElementById(id);
/* 서버(node)도 roll.js를 import해서 생을 뽑는다 — roll.js가 이 파일을 거치므로
   여기서 matchMedia·navigator를 맨몸으로 부르면 서버가 뜨다가 죽는다. $는 화살표 함수라
   import 시점에 실행되지 않아 괜찮지만, 아래 두 줄은 그 자리에서 실행된다. */
export const reduceMotion=typeof matchMedia!=="undefined"&&matchMedia("(prefers-reduced-motion: reduce)").matches;
/* 헤드리스 자동화(배포 검증 스크립트 등)는 사람이 아니다. 항상 버튼을 누르고 수십 번씩
   굴려서 활성화율·세션당 리롤·공유수를 통째로 왜곡한다. 화면 동작은 그대로 두고
   서버로 보내는 것만 건너뛴다 — 분석 스니펫(gtag 등)은 그대로 발화하므로
   자동화 테스트는 여전히 이벤트 발생을 확인할 수 있다. */
export const isAutomated=typeof navigator!=="undefined"&&navigator.webdriver===true;
/* 확률 롤 전용 난수원. 오늘의 운세는 날짜 시드로 교체해 하루 동안 같은 결과를 만든다 */
let RNG=Math.random;
export const rand=()=>RNG();
/* 오늘의 운세만 날짜 시드 난수로 갈아끼웠다가 되돌린다 */
export function setRNG(f){RNG=f;}
export function mulberry32(seed){return function(){seed|=0;seed=seed+0x6D2B79F5|0;
 let t=Math.imul(seed^seed>>>15,1|seed);t=t+Math.imul(t^t>>>7,61|t)^t;
 return((t^t>>>14)>>>0)/4294967296;};}
export function strHash(s){let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619);}return h>>>0;}
export function gauss(){let u=0,v=0;while(!u)u=rand();while(!v)v=rand();
 return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v);}
export function erf(x){const s=x<0?-1:1;x=Math.abs(x);const t=1/(1+0.3275911*x);
 const y=1-((((1.061405429*t-1.453152027)*t+1.421413741)*t-0.284496736)*t+0.254829592)*t*Math.exp(-x*x);
 return s*y;}
export const phi=x=>0.5*(1+erf(x/Math.SQRT2));
export function pickWeighted(pairs){let sum=0;for(const p of pairs)sum+=p[1];
 let r=rand()*sum; for(const p of pairs){r-=p[1]; if(r<=0)return p;} return pairs[0];}
export function clamp(v,a,b){return Math.min(b,Math.max(a,v));}
export function koNum(n){ /* 큰 수를 한국어 단위로 */
 if(n>=1e8)return (n/1e8).toFixed(n>=3e8?0:1).replace(/\.0$/,"")+"억";
 if(n>=1e4)return Math.round(n/1e4).toLocaleString()+"만";
 return Math.round(n).toLocaleString();}
/* 포맷 함수 속 표시용 문구. 서버도 이 파일을 import하므로 i18n을 여기서 불러올 수 없다 —
   대신 i18n.js(클라이언트 전용)가 로드 시점에 현재 언어의 문구로 덮어쓴다. */
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
export function isoCode(flag){return [...flag].map(ch=>String.fromCodePoint(ch.codePointAt(0)-0x1F1E6+65)).join("");}
