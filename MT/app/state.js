import {TEAMS} from "../people/teams.js";

/* 저장 상태. 키는 환생 시뮬레이터(rebirth_state)와 반드시 달라야 한다 —
   같은 출처(life-reroll.com)라 localStorage를 공유하므로, 키가 겹치면 서로의 기록을 덮어쓴다. */
const KEY = "mt_state";

/* ===== 기록 초기화 세대 =====
   MT는 서버에 아무것도 저장하지 않는다 — 기록은 전부 방문자 브라우저의 localStorage 다.
   그래서 "모두의 기록을 한 번에 지운다"는 이 숫자를 올리는 것뿐이다. 세대가 다르면 다음
   방문 때 저장분을 통째로 버린다.
   ⚠ 올리면 리롤 횟수·팀별 횟수뿐 아니라 히든 팀 발견 기록도 함께 사라진다(같은 곳에 산다).
     즉 모두가 Synsory 를 다시 처음부터 찾게 된다.
   1 → 2 : 2026-07-31 첫 일괄 초기화 */
const EPOCH = 2;

let raw = {};
try { raw = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { raw = {}; }
/* 세대가 다르면 통째로 버린다. 횟수를 세기 전에 쓰던 옛 형식({seen:[…]})도 여기서 함께 사라진다. */
if (Number(raw.epoch) !== EPOCH) raw = {};

/* 팀별로 뽑힌 횟수. {팀id: 횟수} */
export const counts = {};
if (raw.counts && typeof raw.counts === "object") {
  for (const [k, v] of Object.entries(raw.counts)) if (typeof k === "string" && +v > 0) counts[k] = Math.floor(+v);
}

export const ST = { total: Number(raw.total) || 0 };

/* ===== 히든 팀 감춤 판정 =====
   이스터에그(secret) 팀은 한 번이라도 뽑기 전까지 집계·통계·확률 문구에서 통째로 빠진다.
   뽑기 확률에는 처음부터 들어가 있다 — 감추는 건 표시뿐이다(roll.js는 TEAMS 전체를 쓴다).
   화면에 "전체 몇 팀"을 적는 곳은 전부 visibleTeams()를 거쳐야 한다. TEAMS.length 를 그대로
   쓰면 아직 못 만난 팀이 있다는 사실이 숫자로 새어 나간다. */
export const revealed = t => !t.secret || (counts[t.id] || 0) > 0;
export const visibleTeams = () => TEAMS.filter(revealed);

/* 한 번이라도 나온 팀 수. 진행률 타일이 쓴다. 없어진 id가 counts에 남아 있어도
   드러난 팀만 세므로 분자가 분모를 넘지 않는다. */
export const seenCount = () => visibleTeams().filter(t => counts[t.id] > 0).length;
export const bump = id => { counts[id] = (counts[id] || 0) + 1; };

export function persist() {
  try { localStorage.setItem(KEY, JSON.stringify({epoch: EPOCH, total: ST.total, counts})); } catch (e) {}
}

/* 이 브라우저의 기록만 지운다. 환생 시뮬레이터(rebirth_state)는 건드리지 않는다 —
   브라우저 설정의 "사이트 데이터 삭제"는 출처 단위라 그쪽까지 날리지만, 이건 키 하나만 지운다.
   counts·ST 는 export 된 참조라 재할당하지 않고 제자리에서 비운다. */
export function reset() {
  ST.total = 0;
  for (const k of Object.keys(counts)) delete counts[k];
  try { localStorage.removeItem(KEY); } catch (e) {}
}

/* ===== 표시 설정 =====
   기록(mt_state)과 키를 나눈다 — "기록 초기화"도 EPOCH 상향도 설정까지 지우면 안 된다.
   설정은 기록이 아니고, 껐던 사람에게 다시 켜져서 나타나면 그건 고장으로 읽힌다. */
const PREF_KEY = "mt_prefs";
let praw = {};
try { praw = JSON.parse(localStorage.getItem(PREF_KEY)) || {}; } catch (e) { praw = {}; }

/* showPicks=false 면 금주의 픽이 다른 팀과 완전히 똑같이 보인다(별·금색·팡파레·배지 전부).
   기본값은 켜짐 — 저장된 값이 명시적으로 false 일 때만 끈다. */
export const prefs = { showPicks: praw.showPicks !== false };
export function savePrefs() {
  try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch (e) {}
}

/* 이번 화면에 떠 있는 것 — 저장하지 않는다 */
export const session = { current: null, shared: false };
