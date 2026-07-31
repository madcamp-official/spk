import {TEAMS} from "../people/teams.js";

/* 저장 상태. 키는 환생 시뮬레이터(rebirth_state)와 반드시 달라야 한다 —
   같은 출처(life-reroll.com)라 localStorage를 공유하므로, 키가 겹치면 서로의 기록을 덮어쓴다. */
const KEY = "mt_state";

let raw = {};
try { raw = JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { raw = {}; }

/* 팀별로 뽑힌 횟수. {팀id: 횟수}
   예전 형식({seen:[id,…]})은 "한 번씩 나왔다"로 옮긴다 — 횟수를 세기 전에 쌓인 기록이라
   1보다 정확히 알 방법이 없다. 안 옮기면 이미 놀아 본 사람의 기록이 통째로 0이 된다. */
export const counts = {};
if (raw.counts && typeof raw.counts === "object") {
  for (const [k, v] of Object.entries(raw.counts)) if (typeof k === "string" && +v > 0) counts[k] = Math.floor(+v);
} else if (Array.isArray(raw.seen)) {
  for (const id of raw.seen) if (typeof id === "string") counts[id] = 1;
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
  try { localStorage.setItem(KEY, JSON.stringify({total: ST.total, counts})); } catch (e) {}
}

/* 이번 화면에 떠 있는 것 — 저장하지 않는다(공유·카드가 읽는다) */
export const session = { current: null, shared: false };
