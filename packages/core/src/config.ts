/* ===== 밸런스 수치 (DiscordBot.md §A.8) =====
   샘플링 σ, 희귀도 합성 계수, 배틀 보정 폭, 공덕 수치는 **전부 이 파일에만** 둔다.
   다른 파일에 하드코딩하는 것은 §I 금지 사항이다.

   두 종류가 섞여 있다:
     1) `기존 웹 값` — 이미 라이브에서 돌던 수치. 지금 바꾸면 웹 결과가 바뀌므로
        1단계에서는 값을 그대로 옮기기만 했다. 재조정은 밸런스 논의 후.
     2) `null + TODO(balance)` — 아직 정해지지 않은 값. **임의로 확정하지 않는다.**
        null을 읽는 쪽은 반드시 미구현으로 처리할 것(조용히 0으로 쓰지 말 것). */

/** §D 생 샘플링 분포 파라미터 */
export const SAMPLING = {
  /** 출생 성비: 남아 비율. 기존 웹 값(전역 상수).
   *  TODO(balance): §D는 "국가 출생 성비"를 요구하나 데이터셋에 국가별 값이 없다. */
  pMale: 0.512,

  /** 수명 정규분포의 표준편차(년). 평균은 Country.life. 기존 웹 값. */
  lifespanSigmaYears: 7,
  /** 수명 클램프(년) — 기존 웹 값 */
  lifespanClamp: [45, 106] as [number, number],

  /** 소득 로그정규의 로그 표준편차. 중앙값은 Country.gdp. 기존 웹 값(구 SIGMA).
   *  §D의 "로그정규(우측 꼬리)"는 이미 웹에 구현돼 있어 그대로 쓴다. */
  incomeLogSigma: 0.75,

  /** 키 정규분포 표준편차(cm). 평균은 Country.hm/hf. 기존 웹 값. */
  heightSigmaCm: { male: 7, female: 6.4 },
  /** 키 클램프(cm) — 기존 웹 값 */
  heightClamp: [130, 215] as [number, number],

  /** BMI 정규분포 표준편차. 평균은 Country.bmi. 기존 웹 값. */
  bmiSigma: 4.2,
  /** BMI 클램프 — 기존 웹 값 */
  bmiClamp: [13.5, 48] as [number, number],

  /** IQ 분포. 검사 점수는 정의상 평균 100·표준편차 15이며 국가와 무관하다. */
  iq: { mean: 100, sigma: 15, clamp: [50, 150] as [number, number] },

  /** 왼손잡이 비율. 국가 무관(기존 웹 값). */
  leftyRate: 0.1,

  /** 50세까지 안드로겐성 탈모 비율. 성별로만 뽑는다(기존 웹 값). */
  baldingRate: { male: 0.5, female: 0.2 },

  /** 형제 수 포아송의 λ.
   *  TODO(balance): §D는 국가 합계출산율을 λ로 쓰라고 하나 데이터셋에 출산율이 없다.
   *  값을 지어내지 말고, 국가별 출산율을 추가한 뒤 Country.fertility 를 참조할 것. */
  siblingsLambda: null as number | null,
} as const;

/** §D 생 희귀도 점수 — 축별 국가 내 백분위 합성 × 국가 확률.
 *  TODO(balance): 합성 공식(가중치·정규화 방식)이 미정이다. 표기는 "상위 n%". */
export const RARITY_SCORE = {
  /** 국가 뽑힐 확률에 걸 지수/가중치 */
  countryWeight: null as number | null,
  /** 생 극단성(축별 백분위 합성)에 걸 가중치 */
  lifeWeight: null as number | null,
  /** 합성에 쓸 축과 각 축의 비중 */
  axisWeights: null as Record<string, number> | null,
} as const;

/** §E 배틀 */
export const BATTLE = {
  /** 3축 3판 2선승 — 축 개수 */
  axesPerBattle: 3,
  /** 각 축 판정에 거는 랜덤 보정 폭(±비율). §E는 "±10% 이내"라고만 한다.
   *  TODO(balance): 정확한 폭과 분포(균등/정규) 미확정. */
  axisJitter: null as number | null,
  /** 같은 상대와의 1일 배틀 상한 (§E) */
  dailyPerOpponent: 3,
} as const;

/** 공덕(merit) 수치 — §C 추가 뽑기, §E 언더독 보상 */
export const MERIT = {
  /** 1일 기본 뽑기 횟수 (§C) */
  dailyRolls: 3,
  /** 추가 뽑기 1회의 공덕 비용. TODO(balance) */
  rerollCost: null as number | null,
  /** 열세 측이 이겼을 때 지급(대폭). TODO(balance) */
  underdogWin: null as number | null,
  /** 우세 측이 이겼을 때 지급(소액). TODO(balance) */
  favoriteWin: null as number | null,
} as const;

/** §D 출생 번호 라운드 넘버 칭호 — 어느 번호에 줄지만 정하고 문구는 2단계에서. */
export const MILESTONE_BIRTH_NUMBERS = [100, 1000, 10000] as const;
