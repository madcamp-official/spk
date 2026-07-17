import {DATA,REL,TOTAL,P_MALE} from "./data.js";
import {isoCode} from "./util.js";
import {incomeTopPct} from "./roll.js";

/* ===== 생을 링크에 담기 =====
   링크만 받은 사람도 공유한 사람이 뽑은 생을 그대로 본다. 없으면 링크를 눌러도
   자기 생이 새로 뽑혀서, 정작 "무슨 생을 받았는지"는 텍스트에만 남는다.

   시드(?s=난수)로 다시 굴리는 방법이 URL은 짧지만 쓰지 않았다. 시드는 "그때의
   data.js + 그때의 뽑기 순서"에 통째로 의존해서, 나라를 하나 추가하거나 뽑는 순서를
   바꾸는 순간 어제 뿌린 링크가 전부 다른 생을 가리킨다. 조용히 틀리기 때문에
   아무도 눈치채지 못한다. 그래서 값을 직접 싣는다.

   국가는 인덱스가 아니라 ISO 코드다 — DATA 중간에 나라를 끼워 넣어도 안 깨지게.

   형식: iso-male-urban-lefty-relIdx-ethIdx-lifeExp-income-iq-height-weight×10
   예:   KR-1-1-0-2-0-81-31400-103-174-684
   c·top·prob·bmi는 이 값들에서 계산되므로 싣지 않는다. */

const SEP = "-";

export function encodeLife(l) {
  const relArr = REL[l.c.rel] || [];
  const ethArr = l.c.eth || [];
  const relIdx = relArr.findIndex(x => x[0] === l.rel[0]);
  const ethIdx = ethArr.findIndex(x => x[0] === l.eth[0]);
  return [
    isoCode(l.c.flag),
    l.male ? 1 : 0,
    l.urban ? 1 : 0,
    l.lefty ? 1 : 0,
    relIdx < 0 ? 0 : relIdx,
    ethIdx < 0 ? 0 : ethIdx,
    l.lifeExp,
    Math.round(l.income),
    l.iq,
    l.height,
    Math.round(l.weight * 10),
  ].join(SEP);
}

/* URL 파라미터는 남이 아무거나 넣을 수 있다. 하나라도 이상하면 통째로 버리고
   null을 돌려준다 — 그러면 호출부가 평소대로 새 생을 뽑는다.
   여기서 하는 건 "형식·범위가 맞는가"뿐이다. "정말 뽑힌 생인가"는 값만 보고는 알 수 없다
   (모나코·IQ150을 손으로 적어도 전부 범위 안이다). 그건 서버 서명이 답한다 → lifepool.js
   shared: 이 생이 남이 뽑아 보내준 것이면 true. 내 도감·통계에 넣지 않는 근거가 된다.
           서버가 나에게 뽑아준 생도 같은 문자열을 거쳐 오므로 반드시 구분해야 한다. */
export function decodeLife(s, shared) {
  if (!s || typeof s !== "string" || s.length > 64) return null;
  const p = s.split(SEP);
  if (p.length !== 11) return null;

  const iso = p[0].toUpperCase();
  if (!/^[A-Z]{2}$/.test(iso)) return null;
  const ci = DATA.findIndex(c => isoCode(c.flag) === iso);
  if (ci < 0) return null;
  const c = DATA[ci];

  const n = (i, lo, hi) => {
    const v = Number(p[i]);
    return Number.isFinite(v) && v >= lo && v <= hi ? v : null;
  };
  const male = n(1, 0, 1), urban = n(2, 0, 1), lefty = n(3, 0, 1);
  const relIdx = n(4, 0, 99), ethIdx = n(5, 0, 99);
  const lifeExp = n(6, 45, 106);
  const income = n(7, 1, 1e9);
  const iq = n(8, 50, 150);
  const height = n(9, 130, 215);
  const w10 = n(10, 100, 6000);
  if ([male, urban, lefty, relIdx, ethIdx, lifeExp, income, iq, height, w10].some(v => v === null)) return null;

  const relArr = REL[c.rel] || [];
  const ethArr = c.eth || [];
  /* 배열이 바뀌어 인덱스가 범위를 벗어나면 첫 항목으로 떨어진다 — 나라·성별 같은
     굵직한 건 맞고 종교만 어긋나는 정도라, 링크를 통째로 버리는 것보다 낫다. */
  const rel = relArr[relIdx] || relArr[0];
  const eth = ethArr[ethIdx] || ethArr[0];
  if (!rel || !eth) return null;

  const weight = w10 / 10;
  const pC = c.pop / TOTAL, pG = male ? P_MALE : 1 - P_MALE;
  const pU = urban ? c.urban / 100 : 1 - c.urban / 100;
  return {
    ci, c,
    male: !!male, urban: !!urban, lefty: !!lefty,
    rel, eth, lifeExp, income, iq, height, weight,
    bmi: weight / Math.pow(height / 100, 2),
    top: incomeTopPct(income),
    prob: pC * pG * pU,
    shared: !!shared,   /* true면 남이 뽑은 것 — 내 도감·최고기록·환생 횟수에 넣으면 안 된다 */
  };
}
