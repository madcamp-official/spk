/* 앱 조립. /MT 팀 리롤 — 25팀 중 하나를 뽑아 팀명과 팀원을 보여준다.
   환생 시뮬레이터(apps/web)와 코드를 공유하지 않는다: 그쪽은 core(뽑기·서명·i18n)를
   물고 있어서 끌어오면 이 페이지에 필요 없는 것이 통째로 딸려 온다. */
import {byId} from "../people/teams.js";
import {$} from "./util.js";
import {ST, session} from "./state.js";
import {rollTeam} from "./roll.js";
import {renderTeam, recordRoll, updateStats} from "./render.js";
import "./effects.js";

function doRoll() {
  const t = rollTeam();
  recordRoll(t);
  renderTeam(t);
  /* 이제 내가 뽑은 팀이다. 배너를 걷고 URL의 ?t= 도 지운다 — 안 지우면 새로고침했을 때
     친구 팀이 되살아나 자기가 뽑은 걸 잃은 것처럼 보인다. */
  if (!$("sharedNote").hidden) {
    $("sharedNote").hidden = true;
    const u = new URL(location.href);
    u.searchParams.delete("t");
    history.replaceState(null, "", u);
  }
}
$("rollBtn").addEventListener("click", doRoll);

/* ===== 링크로 받은 팀 =====
   ?t=<팀id> 가 붙어 있으면 그 팀을 그대로 보여준다. 공유 버튼은 없앴지만 주소를 직접
   건네주는 길은 남겨 둔다 — 링크를 눌렀는데 엉뚱한 팀이 새로 뽑히면 안 되기 때문이다.
   recordRoll 은 부르지 않는다 — 남이 뽑은 것이 내 횟수·나온 팀에 들어가면 안 된다. */
const shared = new URLSearchParams(location.search).get("t");
const sharedTeam = shared ? byId(shared) : null;
if (sharedTeam) {
  renderTeam(sharedTeam);
  session.shared = true;
  $("rollNo").textContent = "친구가 뽑은 팀입니다";
  $("rollBtn").textContent = "직접 뽑아 보기";
  $("sharedNote").hidden = false;
} else if (shared) {
  /* 없는 id. 화면은 첫 방문 그대로 두고 배너로만 알린다 — 여기서 아무 팀이나 그리면
     받은 사람은 그게 친구가 보낸 팀인 줄 안다. */
  const n = $("sharedNote");
  n.classList.add("bad");
  n.textContent = "⚠️ 없는 팀 링크예요 — 오래된 링크일 수 있습니다";
  n.hidden = false;
}

updateStats();
if (!sharedTeam && ST.total > 0) $("rollNo").textContent = "지금까지 " + ST.total.toLocaleString() + "번 뽑았습니다";

/* 콘솔·자동 검증에서 내부를 들여다볼 수 있게 열어 둔다(비밀 없음) */
window.__mt = {ST, session, rollTeam, renderTeam, recordRoll};
