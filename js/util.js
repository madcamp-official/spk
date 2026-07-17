/* 공용 헬퍼: DOM 단축, 난수원, 숫자 포맷 */
export const $=id=>document.getElementById(id);
export const reduceMotion=matchMedia("(prefers-reduced-motion: reduce)").matches;
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
export function fmtPct(p){const pct=p*100;
 if(pct>=1)return pct.toFixed(1)+"%";
 if(pct>=0.01)return pct.toFixed(2)+"%";
 if(pct>=0.0001)return pct.toFixed(Math.min(6,1-Math.floor(Math.log10(pct))))+"%";
 return "0.0001% 미만";}
/* 등급 대신 확률(%)을 이벤트에 싣는다. 희귀한 생일수록 공유가 터지는지 볼 수 있어야 한다. */
export function probPct(p){return +(p*100).toFixed(4);}
/* 소득 상위 % 표시: 반올림으로 "상위 100%"/"상위 0.0%"가 나오지 않게 캡 */
export function fmtTop(t){if(t<0.1)return "0.1% 이내";if(t<1)return t.toFixed(1)+"%";return Math.min(99,Math.round(t))+"%";}
export function fmtUSD(v){ /* 유효숫자 3자리 반올림: $2,430 / $47,800 처럼 읽히게 */
 const mag=Math.pow(10,Math.max(0,Math.floor(Math.log10(Math.max(v,1)))-2));
 return "$"+(Math.round(v/mag)*mag).toLocaleString();}
export function isoCode(flag){return [...flag].map(ch=>String.fromCodePoint(ch.codePointAt(0)-0x1F1E6+65)).join("");}
