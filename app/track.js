import {ST,session} from "./state.js";
import {probPct,isAutomated} from "./util.js";

/* ===== 유입 추적 · 이벤트 트래킹 =====
   공유 URL에 ?ref=출처&v=문구변형 이 붙는다. 분석 도구(GA4/PostHog/Plausible)
   스니펫을 페이지에 붙이면 track()이 자동으로 이벤트를 흘려보낸다. */
if(!ST.dev)ST.dev=Math.random().toString(36).slice(2,10);
if(ST.ab!=="a"&&ST.ab!=="b")ST.ab=Math.random()<0.5?"a":"b";
const QS=new URLSearchParams(location.search);
const REF=QS.get("ref")||"";
if(REF&&!ST.refFirst)ST.refFirst=REF;
/* vin = 나를 데려온 공유 카피, ab = 내가 공유할 때 쓸 카피. 한 기기가 유입자이자
   공유자라 둘을 한 필드로 합치면 A/B 유입 비교가 자기 동전던지기에 묻힌다. */
const VQ=QS.get("v");
const VIN=(VQ==="a"||VQ==="b")?VQ:"";
if(VIN&&!ST.vIn)ST.vIn=VIN;
export const RETURNING=ST.total>0;
/* ===== 이벤트 큐 =====
   리롤 클릭 경로에서는 배열에 push만 한다. 실제 전송은 3초 유휴 또는 이탈 시점에
   sendBeacon으로 몰아서 — 응답을 기다리지 않고, 실패해도 무시한다.
   (데이터 몇 개 잃는 게 리롤 체감을 잃는 것보다 싸다) */
const EVENT_API="/api/track";
const _q=[];let _qTimer=null;
export function flushEvents(){
 if(_qTimer){clearTimeout(_qTimer);_qTimer=null;}
 if(!_q.length)return;
 if(!navigator.sendBeacon){_q.length=0;return;}
 while(_q.length){
  const batch=_q.splice(0,50);
  try{
   const ok=navigator.sendBeacon(EVENT_API,
    new Blob([JSON.stringify(batch)],{type:"application/json"}));
   if(!ok){_q.unshift.apply(_q,batch);break;} /* 브라우저 큐 포화 — 되돌리고 중단 */
  }catch(e){break;}
 }
}
export function track(ev,props){
 try{
  ST.metrics=ST.metrics||{};ST.metrics[ev]=(ST.metrics[ev]||0)+1;
  /* ref/vin/v 각인은 전송 경로와 무관하게 여기서 끝난다. 큐에는 각인된 뒤의 것이
     들어간다 — 여기서 빠지면 vin이 사라져 문구 A/B를 영영 못 읽는다. */
  const p=Object.assign({ref:REF||ST.refFirst||"direct",v:ST.ab,
   vin:VIN||ST.vIn||"none"},props||{});
  if(!isAutomated){
   _q.push({e:ev,p});
   if(_q.length>500)_q.splice(0,_q.length-500); /* 전송이 계속 실패해도 무한정 쌓지 않는다 */
   if(!_qTimer)_qTimer=setTimeout(flushEvents,3000);
  }
  /* 외부 스니펫을 붙였을 때만 동작. 경로 A(자체 수집)에서는 전부 no-op이다. */
  if(window.gtag)gtag("event",ev,p);
  if(window.posthog&&window.posthog.capture)posthog.capture(ev,p);
  if(window.plausible)plausible(ev,{props:p});
 }catch(e){}
}
/* ===== 세션 계측 =====
   activate: 첫 방문에서 첫 리롤까지 걸린 시간 (Activation 문턱)
   exit: 떠날 때까지 굴린 횟수 */
const T_LOAD=performance.now();
let sessionRolls=0,activated=false,exitSent=false;
export function markRoll(){
 sessionRolls++;
 if(activated)return;
 activated=true;
 track("activate",{ms:Math.round(performance.now()-T_LOAD),returning:RETURNING});
}
/* ===== 체류 시간 = "이번 생 어때요?"의 답 =====
   이모지 평가를 대신한다. 결과를 오래 들여다볼수록 마음에 든 것이고, 1초도 안 돼
   다시 굴렸으면 심심했다는 뜻이다. 클릭을 요구하지 않아 모든 생에서 수집된다.
   reason: 이 생을 왜 떠났는가 (reroll=다시 굴림 / exit=이탈) */
export function sendDwell(reason){
 if(!session.currentLife||!session.lifeShownAt||session.dwellSent)return;
 session.dwellSent=true;
 track("dwell",{ms:Math.round(performance.now()-session.lifeShownAt),
  country:session.currentLife.c.name,prob:probPct(session.currentLife.prob),
  shared:session.lifeShared,reason});
}
/* pagehide/visibilitychange만 모바일에서 신뢰할 수 있다(beforeunload는 안 뜬다).
   탭 전환마다 중복 발사되지 않도록 세션당 1회로 막는다. */
export function sendExit(){
 if(exitSent)return;exitSent=true;
 sendDwell("exit");
 track("exit",{rolls:sessionRolls,activated});
}
/* exit·마지막 dwell은 이 시점에만 존재한다. 큐에 넣은 직후 반드시 flush해야
   회수된다(exitSent로 두 번째 호출이 막혀도 flush는 항상 돈다). */
addEventListener("pagehide",()=>{sendExit();flushEvents();});
addEventListener("visibilitychange",()=>{
 if(document.visibilityState==="hidden"){sendExit();flushEvents();}
});
