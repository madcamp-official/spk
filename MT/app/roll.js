import {TEAMS} from "../people/teams.js";

/* 균등. 인원수·주차·금주의 픽·히든 여부 어느 것으로도 가중치를 주지 않는다 —
   "누구 팀이든 똑같이 나온다"가 이 페이지의 약속이다. 히든 팀(secret)도 여기서는
   그냥 한 팀이다: 감추는 건 표시뿐이라 TEAMS 전체를 그대로 쓴다(state.js revealed 참고). */
const pick = () => TEAMS[Math.floor(Math.random() * TEAMS.length)];

/* 직전에 나온 팀이 곧바로 또 나오면 버튼이 고장 난 것처럼 보인다. 25개 중 하나라
   연속 확률이 4%나 된다. 다시 뽑는 건 딱 한 번만 한다 — 될 때까지 돌리면 균등이 휜다
   (그래도 연속은 0.16%로 떨어진다). */
let last = null;
export function rollTeam() {
  let t = pick();
  if (TEAMS.length > 1 && t.id === last) t = pick();
  last = t.id;
  return t;
}

/* 금주의 픽 = 이 페이지의 유일한 희귀도 축(예전의 인원수 기준은 없앴다).
   픽이 뜨면 히어로 테두리가 금색이 되고 컨페티가 터진다 — 환생 시뮬레이터에서
   인구 500만 미만이 하던 역할이다. 확률은 픽이든 아니든 똑같이 4%다. */
export const rarityColor = t => (t.pick ? "#f3c95c" : "#2a3158");
