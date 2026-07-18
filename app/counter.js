import {$,isAutomated} from "./core/util.js";

/* ===== 모두의 환생 횟수 (같은 도메인의 /api/counter) =====
   카운터 서버가 없으면 globalTotal이 null로 남고 타일은 숨겨진 채 앱은 그대로 동작한다. */
const COUNTER_API="/api/counter";
let globalTotal=null;
export function showGlobal(n){
 globalTotal=n;
 $("stGlobal").textContent=n.toLocaleString();
 $("globalStat").hidden=false;
}
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
