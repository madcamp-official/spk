import {PICKS, roundLabel, iconURL, bgmURL} from "../people/teams.js";
import {$, esc, reduceMotion} from "./util.js";
import {ST, counts, seenCount, visibleTeams, bump, session, persist} from "./state.js";
import {rarityColor} from "./roll.js";
import {burstConfetti, playBGM, stopBGM} from "./effects.js";
import {paintTally} from "./tally.js";

/* 이미 나왔던 팀이 또 나왔을 때 깔리는 곡. 한글 파일명이라 주소는 인코딩해서 만든다. */
const REPEAT_BGM = "bgm/" + encodeURIComponent("감옥에서누가돌아왔게.m4a");

/* 히어로 배지. 지금은 금주의 픽 하나뿐이다.
   "N팀 중"의 N은 드러난 팀 수다 — TEAMS.length 를 쓰면 아직 못 만난 히든 팀의 존재가 샌다. */
function teamBadges(t) {
  return t.pick ? ["⭐ 금주의 픽 · " + visibleTeams().length + "팀 중 " + PICKS.length + "팀"] : [];
}

export function updateStats() {
  const total = visibleTeams().length;
  $("stTotal").textContent = ST.total.toLocaleString();
  $("stSeen").textContent = seenCount() + "/" + total;
  $("seenBar").style.width = (seenCount() / total * 100) + "%";
  paintTally();
}

/* opts.repeat = 이번에 뽑은 팀이 전에도 나왔던 팀인가. 판정은 부르는 쪽(main.js)이 한다 —
   여기서 counts 로 판정하면 링크(?t=)로 들어온 화면에서도 "또 나왔다"가 울린다. */
export function renderTeam(t, opts) {
  session.current = t;
  session.shared = false;

  $("hero").style.setProperty("--rarity-color", rarityColor(t));
  $("popline").hidden = false;
  /* 누적 횟수를 결과 화면에도 한 조각 얹는다 — 집계 카드를 펴 보지 않아도
     "또 얘네야?"가 바로 읽힌다. 0회(아직 안 뽑은 팀을 링크로 받은 경우)면 뺀다. */
  const mine = counts[t.id] || 0;
  $("popline").innerHTML = esc(roundLabel(t)) +
    (mine > 0 ? ' · <span class="pop-prob">내 기록 ' + mine + "번째</span>" : "");
  /* 팀 아이콘. alt 는 비운다 — 바로 아래 h2 가 같은 팀 이름을 이미 말하고 있어서
     읽어 주면 두 번 읽힌다(장식용 이미지). 파일이 없으면(오타·배포 누락) 빈 칸이
     남으므로 이모지로 되돌린다 — 결과 화면 맨 위가 통째로 비는 것보다 낫다. */
  const ico = $("emoji"), url = iconURL(t);
  if (url) {
    ico.innerHTML = '<img src="' + esc(url) + '" alt="">';
    ico.firstChild.addEventListener("error", () => { ico.textContent = t.emoji; });
  } else {
    ico.textContent = t.emoji;
  }
  $("teamName").textContent = t.name;
  /* 서브라인은 첫 화면 안내("아래 버튼을 누르면…") 전용이다. 결과가 나오면 접는다 —
     인원수는 바로 아래 칩 개수로 이미 보인다. */
  $("subline").hidden = true;
  $("badges").innerHTML = teamBadges(t).map(b => '<span class="badge">' + esc(b) + "</span>").join("");

  /* 열 수 = 인원수. CSS가 이 값을 그대로 받아 팀원이 늘 한 줄에 선다. */
  const chips = $("chips");
  chips.hidden = false;
  chips.style.setProperty("--cols", t.members.length);
  chips.innerHTML = t.members.map((name, i) =>
    '<div class="chip" style="transition-delay:' + (reduceMotion ? 0 : i * 80) + 'ms">' +
    '<div class="k">팀원 ' + (i + 1) + '</div><div class="v">' + esc(name) + "</div></div>").join("");
  requestAnimationFrame(() => requestAnimationFrame(() => {
    chips.querySelectorAll(".chip").forEach(el => el.classList.add("reveal"));
  }));

  $("rollBtn").textContent = "다시 뽑기";
  if (t.pick) burstConfetti(rarityColor(t));

  /* 소리 우선순위: 팀 전용 BGM(히든) > "또 나왔다" > 무음.
     팀 전용이 이긴다 — 히든을 두 번째로 만났을 때 두 곡을 겹쳐 틀면 둘 다 안 들리고,
     그 팀의 시그니처가 반복음에 묻힌다. 아무것도 아니면 틀어져 있던 것을 끈다(안 끄면
     다음 팀을 뽑아도 소리가 남아 엉뚱한 팀의 배경음처럼 들린다). */
  const bgm = bgmURL(t);
  if (bgm) playBGM(bgm);
  else if (opts && opts.repeat) playBGM(REPEAT_BGM);
  else stopBGM();
}

export function recordRoll(t) {
  ST.total++;
  bump(t.id);
  persist();
  updateStats();
  $("rollNo").textContent = "나의 " + ST.total.toLocaleString() + "번째 뽑기";
}
