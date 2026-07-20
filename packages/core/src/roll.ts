/* ===== 환생 로직 (DiscordBot.md §D) =====
   apps/web/app/engine/roll.js 에서 옮겨 왔다. 계산은 한 줄도 바꾸지 않았고,
   흩어져 있던 수치만 config.ts로 뺐다(§A.8) — 값은 기존과 동일하다.

   웹·서버(server/counter.js)·봇(2단계)이 전부 이 파일 하나를 쓴다. */
import { DATA, TOTAL, CUM, REL, RARITY } from "./data.js";
import { SAMPLING, RARITY_SCORE, TRAITS, KARMA } from "./config.js";
import { rand, gauss, phi, clamp, pickWeighted } from "./util.js";
import type { Country, Life, Trait, WeightedPair } from "./types.js";

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

/* ── §D 특성 태그 · 희귀도 (2단계에서 구현) ───────────────────────── */

/** §D 특성 태그 — 지금 뽑고 있는 값에서만 파생한다(새 데이터 0).
 *  「대가족」은 형제 수가 필요해 아직 없다 — 출산율 데이터가 생기면 여기 추가한다.
 *  임계값은 전부 config.TRAITS(§A.8). 태그는 전부 긍정형이다(§F 톤 가이드). */
export function deriveTraits(life: Life): Trait[] {
  const t: Trait[] = [];
  if (life.lifeExp >= TRAITS.longevityMinYears) t.push({ key: "longevity", axis: "lifeExp" });
  if (life.top <= TRAITS.wealthTopPct) t.push({ key: "wealth", axis: "income" });
  if (life.c.pop < TRAITS.rareLandMaxPopM) t.push({ key: "rare_land", axis: "pop" });
  if (life.iq >= TRAITS.geniusMinIq) t.push({ key: "genius" });
  if (life.lefty) t.push({ key: "lefty" });
  return t;
}
/** 업 계승으로 물려받을 수 있는 태그 목록(고정 순서). 버튼을 만들 때 쓴다. */
export const TRAIT_KEYS = ["longevity", "wealth", "rare_land", "genius", "lefty"] as const;
export type TraitKey = typeof TRAIT_KEYS[number];

export function hasTrait(life: Life, key: string): boolean {
  return deriveTraits(life).some(t => t.key === key);
}

/** 한 축이 "이만큼 극단적일" 확률(양쪽 꼬리). 1이면 평범, 0에 가까울수록 드물다. */
function tailProb(value: number, mean: number, sigma: number): number {
  if (!(sigma > 0)) return 1;
  const p = phi((value - mean) / sigma);
  return clamp(1 - Math.abs(2 * p - 1), 1e-9, 1);
}

/** §D 생 희귀도 점수 = "이 생보다 희귀한 생이 나올 확률". ×100 하면 "상위 n%".
 *  값이 작을수록 희귀하다. 공식과 계수는 config.RARITY_SCORE 참고.
 *
 *  ⚠ Life.prob(국가×성별×도시)과는 다른 값이다 — prob은 "이 조합이 나올 확률"이고
 *  이건 국가 확률에 스탯 극단성까지 곱한 것이다. 서로 대체하지 말 것. */
export function rarityScore(life: Life): number {
  const cw = RARITY_SCORE.countryWeight ?? 1;
  const lw = RARITY_SCORE.lifeWeight ?? 1;
  const w = RARITY_SCORE.axisWeights ?? {};
  const c = life.c;
  /* 국가: 인구 비중이 곧 뽑힐 확률 */
  let score = Math.pow(c.pop / TOTAL, cw);
  /* 축별 극단성. 평균·표준편차는 그 생을 만든 분포 그대로 쓴다(샘플링과 같은 기준). */
  const axes: [number, number, number, number][] = [
    /* [값, 국가 평균, 표준편차, 가중치] */
    [life.lifeExp, c.life, SAMPLING.lifespanSigmaYears, w.lifeExp ?? 0],
    [Math.log(life.income), Math.log(c.gdp), SAMPLING.incomeLogSigma, w.income ?? 0],
    [life.iq, SAMPLING.iq.mean, SAMPLING.iq.sigma, w.iq ?? 0],
    [life.height, life.male ? c.hm : c.hf,
      life.male ? SAMPLING.heightSigmaCm.male : SAMPLING.heightSigmaCm.female, w.height ?? 0],
  ];
  for (const [v, mean, sigma, weight] of axes) {
    if (weight > 0) score *= Math.pow(tailProb(v, mean, sigma), lw * weight);
  }
  return clamp(score, 1e-12, 1);
}

/** §C 업 계승 — 주어진 특성을 가진 생이 나올 때까지 다시 뽑는다(기각 표집).
 *  상한(config.KARMA.maxResamples) 안에 못 찾으면 마지막 생을 그대로 돌려주고
 *  inherited:false 로 알린다 — 실패를 성공인 척하지 않는다. */
export function rollLifeWithTrait(traitKey: string): { life: Life; inherited: boolean; tries: number } {
  let life = rollLife();
  for (let i = 1; i <= KARMA.maxResamples; i++) {
    if (hasTrait(life, traitKey)) return { life, inherited: true, tries: i };
    life = rollLife();
  }
  return { life, inherited: false, tries: KARMA.maxResamples };
}

/* ── §D 미구현 — 데이터가 없어서 못 만든 것 (3단계 이후) ──────────── */
