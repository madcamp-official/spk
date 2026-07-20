import {$,isAutomated,reduceMotion} from "../core/util.js";
import {session} from "../core/state.js";
import {t} from "../i18n/i18n.js";

/* ===== 모두의 환생 횟수 (같은 도메인의 /api/counter) =====
   카운터 서버가 없으면 globalTotal이 null로 남고 타일은 숨겨진 채 앱은 그대로 동작한다. */
const COUNTER_API="/api/counter";
let globalTotal=null;

/* 리롤 전 첫 화면에서만: 헤더(#lifeNo)를 "내 횟수"가 아니라 모두의 환생 횟수로 채운다.
   첫 방문자에겐 내 횟수가 0이라 역효과("아무도 안 하나?")라서, 실제 전체 수를 카운트업으로
   보여줘 사회적 증거로 쓴다. 공유받은 생(?s=/?l=)을 여는 중이면 헤더는 그 생 몫이라 건드리지 않는다. */
const _q=new URLSearchParams(location.search);
const ON_LANDING=!_q.get("s")&&!_q.get("l");
let counterRAF=0;
function fillHeader(n){
 if(!ON_LANDING||session.currentLife)return; /* 생이 뜬 뒤엔 그 생 번호가 헤더를 차지한다 */
 const el=$("lifeNo");if(!el)return;
 const set=v=>{el.textContent=t("🌏 다 함께 {n}번 환생했어요",{n:v.toLocaleString()});};
 if(reduceMotion){set(n);return;}
 const dur=1400,t0=performance.now();
 cancelAnimationFrame(counterRAF);
 const step=now=>{
  if(session.currentLife)return; /* 애니메이션 도중 생이 뜨면 헤더는 renderLife에 넘긴다 */
  const p=Math.min(1,(now-t0)/dur),e=1-Math.pow(1-p,3); /* easeOutCubic */
  set(Math.round(n*e));
  if(p<1)counterRAF=requestAnimationFrame(step);
 };
 counterRAF=requestAnimationFrame(step);
}

export function showGlobal(n){
 globalTotal=n;
 $("stGlobal").textContent=n.toLocaleString();
 /* 통계의 '모두의 환생 횟수' 타일은 생을 뽑은 뒤에만 — 랜딩에선 헤더가 같은 수를 대신하므로
    같은 숫자가 두 번 보이지 않게 여기서는 숨겨 둔다(첫 생을 그릴 때 revealGlobalStat이 켠다). */
 if(session.currentLife)$("globalStat").hidden=false;
 fillHeader(n);
}
/* 첫 생을 그릴 때 통계의 '모두의 환생 횟수' 타일을 드러낸다(render.js에서 호출). */
export function revealGlobalStat(){if(globalTotal!==null)$("globalStat").hidden=false;}

function readGlobal(j){return j&&Number.isFinite(j.total)?j.total:null;}
fetch(COUNTER_API,{cache:"no-store"})
 .then(r=>r.ok?r.json():null).then(j=>{const n=readGlobal(j);if(n!==null)showGlobal(n);})
 .catch(()=>{});
export function bumpGlobal(){
 if(globalTotal===null)return;
 showGlobal(globalTotal+1); /* 응답을 기다리지 않고 먼저 올리고, 서버 값이 오면 맞춘다 */
 if(isAutomated)return;     /* 화면에는 올려 주되 공개 카운터는 자동화로 부풀리지 않는다 */
 fetch(COUNTER_API+"/inc",{method:"POST",cache:"no-store"})
  .then(r=>r.ok?r.json():null).then(j=>{const n=readGlobal(j);if(n!==null)showGlobal(n);})
  .catch(()=>{});
}
