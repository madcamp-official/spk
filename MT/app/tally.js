import {TEAMS, roundLabel, teamsOf, peopleOf, iconURL} from "../people/teams.js";
import {$, esc} from "./util.js";
import {ST, counts, seenCount, visibleTeams, prefs} from "./state.js";

/* 지금까지 나온 횟수 — 팀별 / 사람별. 예전의 "나왔다/안 나왔다" 목록(도감)을 대체한다.
   한 번도 안 나온 것도 0회로 남겨 둔다: 목록이 곧 "나올 수 있는 전부"라는 정보를 겸하고,
   빠지면 몇 팀을 봤는지 알 수 없다.

   ⚠ 단 하나의 예외가 히든 팀(secret)이다. 뽑기 전까지는 팀도, 그 팀에만 있는 사람도
   이 목록에 없다 — 있으면 0회로 이름이 노출돼 이스터에그가 아니게 된다. 뽑는 순간
   visibleTeams()에 들어오고, 그 다음 paintTally()부터 줄이 생긴다.

   사람 횟수 = 그 사람이 속한 팀들의 횟수 합. 한 번 뽑으면 1~4명이 동시에 올라간다.
   teamsOf 는 히든 팀도 세지만 안 뽑았으면 그 횟수가 0이라 합계에 영향이 없다. */
export const personCount = name => teamsOf(name).reduce((a, t) => a + (counts[t.id] || 0), 0);

let tab = "team";

function rows() {
  const vis = visibleTeams();
  if (tab === "team") {
    return vis
      /* ico 는 그대로 innerHTML 에 들어간다 — 아이콘은 <img>, 없으면 이모지 글자. */
      .map(t => ({key: t.id,
                  ico: iconURL(t) ? '<img class="ty-ico" src="' + esc(iconURL(t)) + '" alt="">' : esc(t.emoji),
                  name: t.name,
                  /* 픽 표시를 끄면 ⭐ 도 빠진다 — 목록에만 남으면 그게 곧 픽 명단이 된다 */
                  sub: (t.pick && prefs.showPicks ? "⭐ " : "") + roundLabel(t), n: counts[t.id] || 0}))
      /* 많이 나온 순 → 같으면 주차·이름 순(원래 목록 순서)으로 고정한다. 동점을 정렬에
         맡기면 뽑을 때마다 같은 값끼리 자리를 바꿔 목록이 들썩인다. */
      .sort((a, b) => b.n - a.n || TEAMS.findIndex(t => t.id === a.key) - TEAMS.findIndex(t => t.id === b.key));
  }
  /* 명단도 드러난 팀에서 다시 뽑는다 — PEOPLE(전체)을 쓰면 히든 팀의 사람이 먼저 새어 나간다.
     "N팀"도 마찬가지로 드러난 팀만 센다. */
  return peopleOf(vis)
    .map(p => ({key: p, ico: "", name: p,
                sub: vis.filter(t => t.members.includes(p)).length + "팀", n: personCount(p)}))
    .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, "ko"));
}

export function paintTally() {
  const list = $("tallyList");
  if (!list) return;
  const rs = rows();
  const max = Math.max(1, ...rs.map(r => r.n));

  list.innerHTML = rs.map(r =>
    '<div class="ty-row' + (r.n ? "" : " zero") + '">' +
      /* r.ico 는 rows() 에서 이미 이스케이프를 마친 조각이다 — 여기서 또 걸면 <img> 가 글자로 나온다 */
      '<span class="ty-name">' + (r.ico ? r.ico + " " : "") + "<span>" + esc(r.name) + "</span></span>" +
      '<span class="ty-sub">' + esc(r.sub) + "</span>" +
      '<span class="ty-bar"><i style="width:' + (r.n / max * 100) + '%"></i></span>' +
      '<span class="ty-n">' + r.n + "회</span>" +
    "</div>").join("");

  $("tallySummary").textContent =
    "📊 지금까지 나온 횟수 — " + visibleTeams().length + "팀 중 " + seenCount() +
    "팀 · 총 " + ST.total.toLocaleString() + "번";

  /* 설명줄은 아직 아무것도 안 뽑았을 때의 안내 한 줄만 남긴다.
     ⚠ 여기에 "N팀 모두 확률 X%" 류를 되살릴 거라면 히든 팀부터 생각할 것 —
     드러난 수(25)로 적으면 거짓이 되고, 전체(26)로 적으면 존재가 샌다. */
  $("tallyNote").textContent = ST.total === 0 ? "아직 아무것도 안 나왔어요. 먼저 한 번 뽑아 보세요." : "";
}

$("tallyTabs").addEventListener("click", e => {
  const b = e.target.closest(".ty-tab");
  if (!b || b.dataset.tab === tab) return;
  tab = b.dataset.tab;
  $("tallyTabs").querySelectorAll(".ty-tab").forEach(x => x.classList.toggle("on", x.dataset.tab === tab));
  paintTally();
});
