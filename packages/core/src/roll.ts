/* ===== 환생 로직 (DiscordBot.md §D) =====
   apps/web/app/engine/roll.js 에서 옮겨 왔다. 계산은 한 줄도 바꾸지 않았고,
   흩어져 있던 수치만 config.ts로 뺐다(§A.8) — 값은 기존과 동일하다.

   웹·서버(server/counter.js)·봇(2단계)이 전부 이 파일 하나를 쓴다. */
import { DATA, TOTAL, CUM, REL, RARITY } from "./data.js";
import { SAMPLING } from "./config.js";
import { rand, gauss, phi, clamp, pickWeighted } from "./util.js";
import type { Country, Life, WeightedPair } from "./types.js";

/** 인구 가중 국가 추첨. CUM(누적 인구)에 이분 탐색. */
export function pickCountryIdx(): number {
  const r = rand() * TOTAL;
  let lo = 0, hi = CUM.length - 1;
  while (lo < hi) { const m = (lo + hi) >> 1; if (CUM[m] < r) lo = m + 1; else hi = m; }
  return lo;
}

/** 이 소득이 세계 상위 몇 %인지. 모든 국가의 로그정규를 인구로 가중해 합친다. */
export function incomeTopPct(v: number): number {
  let a = 0;
  for (const c of DATA) a += (c.pop / TOTAL) * phi((Math.log(v) - Math.log(c.gdp)) / SAMPLING.incomeLogSigma);
  return clamp((1 - a) * 100, 0.01, 99.9);
}

export function rarityColor(pop: number): string {
  for (const t of RARITY) if (pop >= t.min) return t.color;
  return RARITY[RARITY.length - 1].color;
}

/* 키는 국가·성별 평균에 개인 편차를 더한다(성인 키 표준편차는 대략 남 7cm / 여 6.4cm).
   몸무게는 국가 평균 BMI에 개인 편차를 더해 뽑은 뒤 그 사람의 키로 역산한다 —
   그래서 키가 크면 같은 BMI라도 몸무게가 자연히 늘어난다. 소득을 1인당 GDP에서
   로그정규로 뽑는 것과 같은 방식의 추정이다. */
export function rollBody(c: Country, male: boolean): { height: number; weight: number; bmi: number } {
  const height = clamp(
    Math.round((male ? c.hm : c.hf) + gauss() * (male ? SAMPLING.heightSigmaCm.male : SAMPLING.heightSigmaCm.female)),
    SAMPLING.heightClamp[0], SAMPLING.heightClamp[1]);
  const bmi = clamp(c.bmi + gauss() * SAMPLING.bmiSigma, SAMPLING.bmiClamp[0], SAMPLING.bmiClamp[1]);
  const weight = Math.round(bmi * Math.pow(height / 100, 2) * 10) / 10;
  return { height, weight, bmi };
}

/* IQ는 나라와 무관하게 뽑는다. IQ 검사 점수는 애초에 어떤 집단에서든 평균 100·표준편차 15가
   되도록 규준화한 값이라 "이 나라 평균 IQ" 같은 건 이 척도 안에 존재하지 않는다.
   국가별 IQ를 내세우는 자료(Lynn 등)가 있긴 하나 표본이 수십 명이거나 이웃 나라 값으로
   채운 것이 많아 폐기된 자료다. 그래서 왼손잡이처럼 어디서 태어나든 같은 분포에서 뽑는다. */
export function rollIQ(): number {
  return clamp(Math.round(SAMPLING.iq.mean + gauss() * SAMPLING.iq.sigma),
    SAMPLING.iq.clamp[0], SAMPLING.iq.clamp[1]);
}
export function iqTopPct(iq: number): number {
  return clamp((1 - phi((iq - SAMPLING.iq.mean) / SAMPLING.iq.sigma)) * 100, 0.01, 99.9);
}

/** 생 한 번 뽑기. fCi/fMale을 주면 그 값으로 고정한다(공유 링크 복원·운세용). */
export function rollLife(fCi?: number | null, fMale?: boolean | null): Life {
  const ci = fCi != null ? fCi : pickCountryIdx(), c = DATA[ci];
  const male = fMale != null ? fMale : rand() < SAMPLING.pMale;
  const urban = rand() < c.urban / 100;
  const rel = pickWeighted(REL[c.rel] as WeightedPair[]);
  const eth = pickWeighted(c.eth as WeightedPair[]);
  const lefty = rand() < SAMPLING.leftyRate;
  /* 안드로겐성 탈모. 성별이 압도적인 변수라 성별로만 뽑는다(왼손잡이와 같은 취급).
     50세까지 남성 약 50% · 여성 약 20%는 널리 인용되는 대략치다.
     나라별로 넣지 않은 이유: 키(NCD-RisC)와 달리 탈모는 198개국을 덮는 조사가 없다.
     동아시아 남성이 유럽계보다 낮다는 건 여러 연구에서 반복 확인되지만, 조사마다 연령대와
     기준(Norwood 등급 컷오프)이 달라 국가별 숫자로 옮기면 대부분 지어내는 값이 된다. */
  const balding = rand() < (male ? SAMPLING.baldingRate.male : SAMPLING.baldingRate.female);
  const lifeExp = clamp(Math.round(c.life + gauss() * SAMPLING.lifespanSigmaYears),
    SAMPLING.lifespanClamp[0], SAMPLING.lifespanClamp[1]);
  const income = c.gdp * Math.exp(gauss() * SAMPLING.incomeLogSigma);
  const top = incomeTopPct(income);
  const body = rollBody(c, male);
  const iq = rollIQ();
  const pC = c.pop / TOTAL, pG = male ? SAMPLING.pMale : 1 - SAMPLING.pMale,
    pU = urban ? c.urban / 100 : 1 - c.urban / 100;
  return { ci, c, male, urban, rel, eth, lefty, balding, lifeExp, income, top, iq, ...body, prob: pC * pG * pU };
}

/* ===================================================================
   §D 미구현 — 시그니처와 타입만 둔다 (2단계)

   아래는 전부 "데이터가 없어서" 못 만든 것이지 "안 만든" 게 아니다.
   호출되면 조용히 틀린 값을 주는 대신 즉시 던진다 — 미구현이 지표에 섞이면
   나중에 원인을 찾을 수 없다. 구현할 때는 config.ts의 null부터 채울 것.
   =================================================================== */

/** §D 형제 수 — 국가 합계출산율을 λ로 하는 포아송.
 *  막힌 이유: 데이터셋에 출산율이 없다(Country.fertility 부재).
 *  TODO(2단계): UN WPP에서 합계출산율을 받아 Country에 추가하고 SAMPLING.siblingsLambda 정리. */
export function rollSiblings(_c: Country): number {
  throw new Error("rollSiblings: 미구현 — 국가 합계출산율 데이터가 필요합니다 (DiscordBot.md §D, 2단계)");
}

/** §D 직업군 — 소득수준별 정적 테이블에서 선택. 인생 요약(§F)의 입력.
 *  막힌 이유: 직업군 테이블 자체가 없고, 톤 가이드(§F)상 문구 검토가 선행돼야 한다.
 *  TODO(2단계): 소득 구간 × 도시/농촌 테이블 정의. */
export function rollOccupation(_life: Life): string {
  throw new Error("rollOccupation: 미구현 — 소득수준별 직업군 테이블이 필요합니다 (DiscordBot.md §D, 2단계)");
}

/** §D 특성 태그 — 위 조합에서 파생(「장수」「대가족」…). 업 계승(§C)의 이월 단위.
 *  TODO(2단계): 태그 목록·임계값 확정. 임계값은 밸런스 수치이므로 config.ts에 둘 것. */
export function deriveTraits(_life: Life): import("./types.js").Trait[] {
  throw new Error("deriveTraits: 미구현 — 특성 태그 목록과 임계값이 필요합니다 (DiscordBot.md §D, 2단계)");
}

/** §D 생 희귀도 점수 — 축별 국가 내 백분위 합성 × 국가 확률. 표기는 "상위 n%".
 *  막힌 이유: 합성 공식이 미정이다(RARITY_SCORE의 계수가 전부 null).
 *  참고: 지금 웹이 쓰는 Life.prob(국가×성별×도시)은 이것과 다른 값이다 — 대체하지 말 것. */
export function rarityScore(_life: Life): number {
  throw new Error("rarityScore: 미구현 — 희귀도 합성 공식이 미확정입니다 (DiscordBot.md §D, config.RARITY_SCORE)");
}
