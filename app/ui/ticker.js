import {$,reduceMotion} from "../core/util.js";
import {DATA} from "../core/data.js";
import {pickCountryIdx} from "../engine/roll.js";
import {t,countryName} from "../i18n/i18n.js";
import {flagHTML} from "./flags.js";

/* ===== 실시간 환생 티커 =====
   리롤 전 첫 화면에서 "방금 누군가 태어났어요"를 한 줄로 흘려보낸다. 나라는 실제 인구
   분포(pickCountryIdx — 나라가 걸릴 확률 = 그 나라 인구 비중, 리롤과 같은 추첨)로 뽑는다.
   ① 결과가 뭔지 글 없이 보여주고 ② 남들도 하고 있음을 보여주고(사회적 증거)
   ③ 초 단위로 움직여 시선을 붙잡는다. 첫 생을 그리면 renderLife가 stopTicker로 걷는다. */
let el=null,timer=0,idx=null,age=0,life=6;

function draw(){
 const c=DATA[idx];
 el.innerHTML=age<2
  ? t("방금 {flag} {country}에서 누군가 태어났어요",{flag:flagHTML(c),country:countryName(c)})
  : t("{flag} {country}에서 누군가 태어났어요 · {n}초 전",{flag:flagHTML(c),country:countryName(c),n:age});
}
function newBirth(){
 idx=pickCountryIdx();age=0;life=5+Math.floor(Math.random()*4); /* 5~8초마다 새 환생 */
 el.classList.remove("show");                                   /* 잠깐 흐려졌다가 */
 requestAnimationFrame(()=>{draw();el.classList.add("show");}); /* 다시 또렷하게(페이드) */
}
function tick(){age++; age>=life?newBirth():draw();}

export function startTicker(){
 el=$("birthTicker");if(!el||timer)return;
 el.hidden=false;
 newBirth();
 if(reduceMotion)return;        /* 움직임을 끈 사용자에겐 한 줄만, 갱신 없이 */
 timer=setInterval(tick,1000);
}
export function stopTicker(){
 if(timer){clearInterval(timer);timer=0;}
 if(el)el.hidden=true;
}
