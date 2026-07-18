/* 앱 조립. 각 기능 모듈은 import 되는 것만으로 자기 버튼에 붙는다. */
import {DATA} from "./core/data.js";
import {$} from "./core/util.js";
import {ST,session,persist} from "./core/state.js";
import {rollLife,rollIQ,iqTopPct} from "./engine/roll.js";
import {renderLife,recordLife,updateStats} from "./ui/render.js";
import {track,markRoll,sendDwell,sendExit,flushEvents,daysSinceFirst} from "./analytics/track.js";
import {probPct} from "./core/util.js";
import {closeDex} from "./ui/dex.js";
import {closeShare,shareURL,shareText} from "./ui/share.js";
import {decodeLife,encodeLife} from "./engine/permalink.js";
import {takeLife,verifyLife,takeSharedByCode} from "./engine/lifepool.js";
import {t} from "./i18n/i18n.js";
import "./ui/odds.js";
import "./ui/fortune.js";
import "./ui/suggest.js";
import "./ui/effects.js";
import "./ui/ads.js";
import "./analytics/reach.js";

/* ===== 리롤 ===== */
/* 결과를 바로 보여준다. 뽑기 연출이 없어 동기 실행이고, 그래서 재진입 가드도 필요 없다. */
function doRoll(){
 sendDwell("reroll"); /* 지금 떠나는 생에 대한 평가를 먼저 보낸다 */
 /* 서버가 미리 뽑아 서명해 둔 생을 버퍼에서 꺼낸다(lifepool.js). 동기라 네트워크를
    기다리지 않는다. 버퍼가 비면 로컬에서 뽑고, 그 생은 공유 링크에 실리지 않는다. */
 const life=takeLife();recordLife(life);
 markRoll(); /* 먼저 세션 리롤 번호·간격을 찍는다 — 그 값을 roll 이벤트에 싣는다 */
 track("roll",{country:life.c.name,prob:probPct(life.prob),
  idx:session.rollIdx,since_prev_ms:session.sincePrevRollMs,quick:session.quickReroll});
 renderLife(life);
 /* 이제 내 생이다. 배너를 걷고 URL의 ?l=도 지운다 — 안 지우면 새로고침했을 때
    친구 생이 되살아나 자기가 뽑은 걸 잃은 것처럼 보인다.
    ref/vin/via는 로드 시점에 이미 ST에 고정돼서 지워도 유입 추적에 영향이 없다. */
 if(!$("sharedNote").hidden){
  $("sharedNote").hidden=true;
  const u=new URL(location.href);
  u.searchParams.delete("s");u.searchParams.delete("l");u.searchParams.delete("sig");
  history.replaceState(null,"",u);
 }
}
$("rollBtn").addEventListener("click",doRoll);

/* Escape는 두 모달 모두를 닫아야 해서 어느 한 기능 모듈에도 속하지 않는다 */
addEventListener("keydown",e=>{
 if(e.key!=="Escape")return;
 if(!$("dexModal").hidden)closeDex();
 if(!$("shareModal").hidden)closeShare();
});

/* exit·마지막 dwell은 이 시점에만 존재한다. 큐에 넣은 직후 flush해야 회수된다. */
addEventListener("pagehide",()=>{sendExit();flushEvents();});
addEventListener("visibilitychange",()=>{
 if(document.visibilityState==="hidden"){sendExit();flushEvents();}
});

/* ===== 공유받은 생 =====
   ?l= 이 붙어 있으면 공유한 사람이 뽑은 생을 그대로 보여준다. 링크를 눌렀는데
   자기 생이 새로 뽑혀 버리면 "무슨 생을 받았길래 공유했는지"를 볼 방법이 없다.
   recordLife는 부르지 않는다 — 남의 생이 내 도감·최고기록·환생 횟수에 들어가면 안 된다.

   ?sig= 는 서버가 이 생을 실제로 뽑았다는 증거다. 서버에 물어 통과한 것만 그린다.
   먼저 그려 놓고 나중에 물리면 안 된다 — 위조된 모나코가 한순간이라도 진짜처럼 보이면
   그때 찍은 스크린샷이 곧 위조 성공이다. 링크를 막 연 참이라 GET 한 번은 로드에 묻힌다. */
const _qs=new URLSearchParams(location.search);
const SHARED_CODE=_qs.get("s");   /* 새 방식: 짧은 코드 → 서버에서 생을 꺼낸다 */
const SHARED_RAW=_qs.get("l");    /* 옛 방식: 이미 뿌려진 링크의 인라인 생(하위호환) */
function showSharedBad(){
 const n=$("sharedNote");
 n.classList.add("bad");
 n.textContent=t("⚠️ 확인할 수 없는 링크예요 — 위조되었거나 오래된 링크일 수 있습니다");
 n.hidden=false;
 track("shared_life_bad",{});
}
function showSharedLife(life){
 renderLife(life);
 $("lifeNo").textContent=t("친구가 받은 생입니다");
 $("rollBtn").textContent=t("🌏 나도 환생해 보기");
 $("sharedNote").hidden=false;
 /* 진짜인 것만 센다 — 안 그러면 조작 링크를 여는 것만으로 이 지표를 부풀릴 수 있다 */
 track("shared_life_view",{country:life.c.name,prob:probPct(life.prob)});
}
if(SHARED_CODE){
 /* 코드로 꺼낸 생은 서버가 저장했다는 것 자체가 진짜라는 증거라 따로 검증하지 않는다.
    먼저 그려 놓고 나중에 물리면 위조가 한순간 진짜처럼 보이므로, 받아 온 뒤에 그린다. */
 takeSharedByCode(SHARED_CODE).then(life=>{life?showSharedLife(life):showSharedBad();});
}else if(SHARED_RAW){
 const life=decodeLife(SHARED_RAW,true); /* true = 남의 생 */
 (life?verifyLife(SHARED_RAW,_qs.get("sig")):Promise.resolve(false)).then(ok=>{
  (ok&&life)?showSharedLife(life):showSharedBad();
 });
}

updateStats();
if(!SHARED_CODE&&!SHARED_RAW&&ST.total>0)$("lifeNo").textContent=t("지금까지 {n}번 환생했습니다",{n:ST.total.toLocaleString()});
/* visit은 아래에 붙는 분석 스니펫이 로드된 뒤(window load) 발화해야 유실되지 않는다.
   days_since_first=0이면 신규, 1이면 어제 처음 온 기기의 D1 복귀다.
   used_fortune은 visit만으로 "운세를 써 본 기기가 더 돌아오는가"를 가르는 열쇠. */
addEventListener("load",()=>{
 track("visit",{days_since_first:daysSinceFirst(),used_fortune:!!ST.fortuneDay});
 persist();
});

/* 브라우저 콘솔·자동 검증에서 내부를 들여다볼 수 있게 열어 둔다(비밀 없음). */
window.__app={DATA,ST,session,rollLife,rollIQ,iqTopPct,renderLife,recordLife,updateStats,track,
 shareURL,shareText,encodeLife,decodeLife};
