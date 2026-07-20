import {$,isAutomated} from "../core/util.js";
import {t} from "../i18n/i18n.js";
import {session} from "../core/state.js";

/* ===== 모두의 환생 횟수 (같은 도메인의 /api/counter) =====
   카운터 서버가 없으면 globalTotal이 null로 남고 타일은 숨겨진 채 앱은 그대로 동작한다. */
const COUNTER_API="/api/counter";
let globalTotal=null;
export function showGlobal(n){
 globalTotal=n;
 $("stGlobal").textContent=n.toLocaleString();
 $("globalStat").hidden=false;
 /* CTA 바로 아래 사회적 증거 줄. 리롤 전에만 띄운다 — 첫 생이 뜨면 아래 stats 타일이
    같은 수를 이어받으므로, 결과 화면에서 같은 숫자가 두 번 보이지 않게 여기서 숨긴다. */
 const rs=$("rollSocial");
 if(rs){
  rs.textContent="👥 "+t("지금까지 {n}번의 환생",{n:n.toLocaleString()});
  if(!session.currentLife)rs.hidden=false;
 }
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
