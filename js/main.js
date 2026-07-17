/* 앱 조립. 각 기능 모듈은 import 되는 것만으로 자기 버튼에 붙는다. */
import {DATA} from "./data.js";
import {$} from "./util.js";
import {ST,session,persist} from "./state.js";
import {rollLife,rollIQ,iqTopPct} from "./roll.js";
import {renderLife,recordLife,updateStats} from "./render.js";
import {track,markRoll,sendDwell,sendExit,flushEvents} from "./track.js";
import {probPct} from "./util.js";
import {closeDex} from "./dex.js";
import {closeShare,shareURL,shareText} from "./share.js";
import "./odds.js";
import "./fortune.js";
import "./suggest.js";
import "./effects.js";

/* ===== 리롤 ===== */
/* 결과를 바로 보여준다. 뽑기 연출이 없어 동기 실행이고, 그래서 재진입 가드도 필요 없다. */
function doRoll(){
 sendDwell("reroll"); /* 지금 떠나는 생에 대한 평가를 먼저 보낸다 */
 const life=rollLife();recordLife(life);
 markRoll();
 track("roll",{country:life.c.name,prob:probPct(life.prob)});
 renderLife(life);
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

updateStats();
if(ST.total>0)$("lifeNo").textContent="지금까지 "+ST.total.toLocaleString()+"번 환생했습니다";
/* visit은 아래에 붙는 분석 스니펫이 로드된 뒤(window load) 발화해야 유실되지 않는다 */
addEventListener("load",()=>{track("visit",{});persist();});

/* 브라우저 콘솔·자동 검증에서 내부를 들여다볼 수 있게 열어 둔다(비밀 없음). */
window.__app={DATA,ST,session,rollLife,rollIQ,iqTopPct,renderLife,recordLife,updateStats,track,
 shareURL,shareText};
