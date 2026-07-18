import {ST,session} from "./core/state.js";
import {probPct,isAutomated} from "./core/util.js";

/* ===== 유입 추적 · 이벤트 트래킹 =====
   공유 URL에 ?ref=출처&v=문구변형 이 붙는다. 분석 도구(GA4/PostHog/Plausible)
   스니펫을 페이지에 붙이면 track()이 자동으로 이벤트를 흘려보낸다. */
if(!ST.dev)ST.dev=Math.random().toString(36).slice(2,10);
if(ST.ab!=="a"&&ST.ab!=="b")ST.ab=Math.random()<0.5?"a":"b";
/* ===== 리텐션 각인 =====
   ip_h는 솔트가 매일 갈려 어제와 이어붙일 수 없다(IP를 안 남기려는 의도적 설계).
   그래서 "다시 온 사람"은 서버가 아니라 기기 스스로만 말할 수 있다. 첫 방문의 달력
   날짜를 저장해 두고 visit마다 며칠째인지 싣는다 — D1 리텐션의 정의가 "다음 날
   또 왔는가"라서 24시간 창이 아니라 달력 날짜로 센다.
   이 계측 이전부터 쓰던 기기는 첫 방문일을 알 수 없어 오늘을 0일째로 잡는다
   (그 기기의 재방문 여부는 activate의 returning이 대신 말해 준다). */
const DAY_MS=86400000;
const localDayNum=()=>Math.floor((Date.now()-new Date().getTimezoneOffset()*60000)/DAY_MS);
if(typeof ST.firstDayNum!=="number"||!isFinite(ST.firstDayNum))ST.firstDayNum=localDayNum();
export function daysSinceFirst(){return Math.max(0,localDayNum()-ST.firstDayNum);}
const QS=new URLSearchParams(location.search);
/* ref는 홍보처마다 자유롭게 붙이는 태그라 via처럼 목록으로 못 막는다. 대신 모양을 강제한다.
   이 값은 "모든" 이벤트에 복사돼 실리므로, 길이를 안 막으면 ?ref=<5000자> 링크 하나로
   배치가 서버의 MAX_BODY(8192)를 넘겨 413으로 잘린다 — sendBeacon은 응답을 안 보니
   그 사람의 계측이 통째로, 소리 없이 죽는다. 짧은 쓰레기 값도 유입 채널 표를 더럽힌다. */
const RAW=QS.get("ref")||"";
const REF=/^[a-z0-9_-]{1,24}$/i.test(RAW)?RAW:"";
if(REF&&!ST.refFirst)ST.refFirst=REF;
/* vin = 나를 데려온 공유 카피, ab = 내가 공유할 때 쓸 카피. 한 기기가 유입자이자
   공유자라 둘을 한 필드로 합치면 A/B 유입 비교가 자기 동전던지기에 묻힌다. */
const VQ=QS.get("v");
const VIN=(VQ==="a"||VQ==="b")?VQ:"";
if(VIN&&!ST.vIn)ST.vIn=VIN;
/* via = 나를 데려온 공유 채널(카톡/X/…). 보내는 쪽은 share_kakao·share_x로 채널을
   구분해 기록하는데 받는 쪽 URL이 전부 같으면 "어느 채널이 사람을 데려오나"에
   답할 수 없다. vin과 같은 규칙으로 첫 유입값만 고정한다.
   화이트리스트로 거른다 — 남이 URL에 아무 문자열이나 넣어 지표를 더럽힐 수 있다. */
export const VIA_CHANNELS=["clip","kakao","insta","x","native","card"];
const AQ=QS.get("via");
const VIA=VIA_CHANNELS.includes(AQ)?AQ:"";
if(VIA&&!ST.viaIn)ST.viaIn=VIA;
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
/* ===== GA4 전용 이름 변환 =====
   events.jsonl·PostHog·Plausible에는 원래 이름 그대로 나간다 — analyze.py가 이벤트
   이름을 정확히 매칭하므로 내부 이름은 여기서 절대 건드리지 않는다. GA4로 가는 복사본만
   고친다:
   - visit: GA4가 자동으로 찍는 page_view와 중복이라 아예 안 보낸다
   - share_text 등 6종: GA4 권장 이벤트 share 하나에 method(clip/kakao/…)로 합친다.
     이름이 6개로 갈라져 있으면 GA4 화면에서 "몇 명이 공유했나"를 한 줄로 못 본다.
     share_open은 시트를 연 것이지 공유가 아니라서 합치지 않는다(analyze.py와 같은 이유).
   - ms·rolls: 콘솔에 맞춤 측정항목으로 등록했을 때 이름만 보고 뜻이 읽히게 바꾼다 */
const GA4_SHARE_METHOD={share_text:"clip",share_kakao:"kakao",share_insta:"insta",
 share_x:"x",share_native:"native",share_card:"card"};
const GA4_RENAME={dwell:{ms:"dwell_ms"},activate:{ms:"ms_to_first_roll"},
 exit:{rolls:"session_rolls"}};
function toGA4(ev,p){
 if(ev==="visit")return null;
 const method=GA4_SHARE_METHOD[ev];
 if(method)return{ev:"share",p:Object.assign({method},p)};
 const ren=GA4_RENAME[ev];
 if(ren){
  p=Object.assign({},p);
  for(const k in ren){if(k in p){p[ren[k]]=p[k];delete p[k];}}
 }
 return{ev,p};
}
export function track(ev,props){
 try{
  ST.metrics=ST.metrics||{};ST.metrics[ev]=(ST.metrics[ev]||0)+1;
  /* ref/vin/v 각인은 전송 경로와 무관하게 여기서 끝난다. 큐에는 각인된 뒤의 것이
     들어간다 — 여기서 빠지면 vin이 사라져 문구 A/B를 영영 못 읽는다. */
  const p=Object.assign({ref:REF||ST.refFirst||"direct",v:ST.ab,
   vin:VIN||ST.vIn||"none",via:VIA||ST.viaIn||"none"},props||{});
  if(!isAutomated){
   _q.push({e:ev,p});
   if(_q.length>500)_q.splice(0,_q.length-500); /* 전송이 계속 실패해도 무한정 쌓지 않는다 */
   if(!_qTimer)_qTimer=setTimeout(flushEvents,3000);
  }
  /* 외부 스니펫을 붙였을 때만 동작. 경로 A(자체 수집)에서는 전부 no-op이다. */
  if(window.gtag){const g=toGA4(ev,p);if(g)gtag("event",g.ev,g.p);}
  if(window.posthog&&window.posthog.capture)posthog.capture(ev,p);
  if(window.plausible)plausible(ev,{props:p});
 }catch(e){}
}
/* ===== 세션 계측 =====
   activate: 첫 방문에서 첫 리롤까지 걸린 시간 (Activation 문턱)
   exit: 떠날 때까지 굴린 횟수 */
const T_LOAD=performance.now();
let sessionRolls=0,activated=false,exitSent=false,lastRollAt=T_LOAD;
export function rollsThisSession(){return sessionRolls;}
export function markRoll(){
 const now=performance.now();
 sessionRolls++;
 /* 이 리롤이 세션 안에서 몇 번째인지, 직전 리롤과 몇 ms 떨어졌는지. main.js가 roll
    이벤트에 실어 보낸다 — dwell을 세션 위치와 함께 읽어야 "2번째 리롤의 긴 dwell(신기함)"과
    "90번째의 긴 dwell(자리 비움)"을 가른다. quick = 1초도 안 보고 다시 굴린 리롤. */
 session.rollIdx=sessionRolls;
 session.sincePrevRollMs=Math.round(now-lastRollAt);
 session.quickReroll=sessionRolls>1&&(now-lastRollAt)<1000;
 lastRollAt=now;
 if(activated)return;
 activated=true;
 track("activate",{ms:Math.round(now-T_LOAD),returning:RETURNING});
}
/* ===== 자리 비움 감지 =====
   dwell 시계는 렌더~다음 행동으로 도는데, 탭이 앞에 떠 있어도(visibilitychange가 안 뜬다)
   사람이 자리를 비우면 그 시간까지 "오래 들여다봤다"로 잡힌다. 마지막 상호작용 뒤
   IDLE_MS가 지나면 그 뒤는 빼고, idle 이유로 dwell을 닫는다. 상호작용이 다시 오면 미뤄진다. */
const IDLE_MS=20000;
let idleTimer=null,lastMark=0;
function clearIdle(){if(idleTimer){clearTimeout(idleTimer);idleTimer=null;}}
function armIdle(){clearIdle();idleTimer=setTimeout(()=>sendDwell("idle"),IDLE_MS);}
export function markActive(){
 session.lastActiveAt=performance.now();
 if(!session.dwellSent&&session.currentLife)armIdle();
}
/* 이 생을 보기 시작한 시각부터 dwell 시계를 켠다(renderLife가 부른다). */
export function startDwellClock(){
 const now=performance.now();
 session.lifeShownAt=now;session.lastActiveAt=now;
 session.dwellSent=false;session.lifeShared=false;
 armIdle();
}
/* 상호작용은 끊임없이 오므로 1초에 한 번만 마크한다 — idle 창이 20초라 초 단위면 충분하다. */
function onActivity(){const n=performance.now();if(n-lastMark<1000)return;lastMark=n;markActive();}
for(const t of ["pointerdown","pointermove","keydown","scroll","touchstart","wheel"])
 addEventListener(t,onActivity,{passive:true});
/* ===== 체류 시간 = "이번 생 어때요?"의 답 =====
   이모지 평가를 대신한다. 결과를 오래 들여다볼수록 마음에 든 것이고, 1초도 안 돼
   다시 굴렸으면 심심했다는 뜻이다. 클릭을 요구하지 않아 모든 생에서 수집된다.
   reason: 이 생을 왜 떠났는가 (reroll=다시 굴림 / fortune=운세 / exit=이탈 / idle=자리 비움) */
export function sendDwell(reason){
 if(!session.currentLife||!session.lifeShownAt||session.dwellSent)return;
 session.dwellSent=true;
 clearIdle();
 /* 마지막 상호작용 + IDLE_MS 까지만 인정한다. 계속 움직이며 읽은 사람은 lastActiveAt이
    같이 밀려 실제 시간에 가깝고, 자리를 뜬 사람은 여기서 잘려 부풀지 않는다. */
 const active=session.lastActiveAt||session.lifeShownAt;
 const ms=Math.round(Math.min(performance.now(),active+IDLE_MS)-session.lifeShownAt);
 /* fromLink = 내가 뽑은 게 아니라 링크로 받아 본 남의 생.
    안 나누면 "내 생 만족도" 분석에 남의 생이 섞인다. 대신 이것만 따로 보면
    "받은 사람이 얼마나 들여다보다 자기 걸 굴리나"라는 활성화 신호가 된다.
    roll_idx = 이 생이 세션 안 몇 번째 리롤인지(남의 생은 0). */
 track("dwell",{ms,country:session.currentLife.c.name,prob:probPct(session.currentLife.prob),
  shared:session.lifeShared,fromLink:!!session.currentLife.shared,
  roll_idx:session.rollIdx||0,reason});
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
