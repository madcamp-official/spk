import {$,isAutomated} from "../core/util.js";

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

/* ===== 증가분 배치 전송 (IMPROVEMENT_LOG #13) =====
   예전엔 리롤마다 POST /api/counter/inc를 즉발했다. 측정해 보니 클릭 경로에서
   가장 무거운 게 계측(track)이 아니라 이 즉발 POST였다 — p95 2.3ms(포함) vs
   0.4ms(제외). "리롤 체감에 1ms도 더하지 않는다"는 track.js의 규약을 카운터가
   깨고 있었던 것. track.js와 같은 패턴으로 고친다: 화면은 낙관적으로 즉시
   올리고, 실제 서버 반영은 증가분을 모았다가 유휴 3초 또는 이탈 시점에
   sendBeacon 한 번으로 보낸다. */
let pending=0;let flushTimer=null;
function flushPending(){
 if(flushTimer){clearTimeout(flushTimer);flushTimer=null;}
 if(!pending)return;
 const n=pending;pending=0;
 if(!navigator.sendBeacon)return; /* 응답을 기다리지 않는다 — 실패해도 무시(track.js와 동일 원칙) */
 try{
  navigator.sendBeacon(COUNTER_API+"/inc",
   new Blob([JSON.stringify({n})],{type:"application/json"}));
 }catch(e){}
}
addEventListener("pagehide",flushPending);
addEventListener("visibilitychange",()=>{
 if(document.visibilityState==="hidden")flushPending();
});
/* sendBeacon은 응답을 안 주므로(추측상 성공만 가정) 낙관적 로컬 값이 다른 방문자의
   증가분과 서서히 어긋난다. 30초마다 서버 진짜 값으로 맞춘다 — 내 증가분이 아직
   전송 대기 중(pending>0)일 때는 되돌아가 보이지 않도록 건너뛴다. */
setInterval(()=>{
 fetch(COUNTER_API,{cache:"no-store"}).then(r=>r.ok?r.json():null)
  .then(j=>{const n=readGlobal(j);if(n!==null&&!pending)showGlobal(n);}).catch(()=>{});
},30000);

export function bumpGlobal(){
 if(globalTotal===null)return;
 showGlobal(globalTotal+1); /* 낙관적으로 먼저 올린다 — 서버 반영은 배치로 뒤따른다 */
 if(isAutomated)return;     /* 화면에는 올려 주되 공개 카운터는 자동화로 부풀리지 않는다 */
 pending++;
 if(!flushTimer)flushTimer=setTimeout(flushPending,3000);
}
