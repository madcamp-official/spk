/** §D 생 샘플링 분포 파라미터 */
export declare const SAMPLING: {
    /** 출생 성비: 남아 비율. 기존 웹 값(전역 상수).
     *  TODO(balance): §D는 "국가 출생 성비"를 요구하나 데이터셋에 국가별 값이 없다. */
    readonly pMale: 0.512;
    /** 수명 정규분포의 표준편차(년). 평균은 Country.life. 기존 웹 값. */
    readonly lifespanSigmaYears: 7;
    /** 수명 클램프(년) — 기존 웹 값 */
    readonly lifespanClamp: [number, number];
    /** 소득 로그정규의 로그 표준편차. 중앙값은 Country.gdp. 기존 웹 값(구 SIGMA).
     *  §D의 "로그정규(우측 꼬리)"는 이미 웹에 구현돼 있어 그대로 쓴다. */
    readonly incomeLogSigma: 0.75;
    /** 키 정규분포 표준편차(cm). 평균은 Country.hm/hf. 기존 웹 값. */
    readonly heightSigmaCm: {
        readonly male: 7;
        readonly female: 6.4;
    };
    /** 키 클램프(cm) — 기존 웹 값 */
    readonly heightClamp: [number, number];
    /** BMI 정규분포 표준편차. 평균은 Country.bmi. 기존 웹 값. */
    readonly bmiSigma: 4.2;
    /** BMI 클램프 — 기존 웹 값 */
    readonly bmiClamp: [number, number];
    /** IQ 분포. 검사 점수는 정의상 평균 100·표준편차 15이며 국가와 무관하다. */
    readonly iq: {
        readonly mean: 100;
        readonly sigma: 15;
        readonly clamp: [number, number];
    };
    /** 왼손잡이 비율. 국가 무관(기존 웹 값). */
    readonly leftyRate: 0.1;
    /** 50세까지 안드로겐성 탈모 비율. 성별로만 뽑는다(기존 웹 값). */
    readonly baldingRate: {
        readonly male: 0.5;
        readonly female: 0.2;
    };
    /** 형제 수 포아송의 λ.
     *  TODO(balance): §D는 국가 합계출산율을 λ로 쓰라고 하나 데이터셋에 출산율이 없다.
     *  값을 지어내지 말고, 국가별 출산율을 추가한 뒤 Country.fertility 를 참조할 것. */
    readonly siblingsLambda: number | null;
};
/** §D 생 희귀도 점수 — 축별 국가 내 백분위 합성 × 국가 확률.
 *  TODO(balance): 합성 공식(가중치·정규화 방식)이 미정이다. 표기는 "상위 n%". */
export declare const RARITY_SCORE: {
    /** 국가 뽑힐 확률에 걸 지수/가중치 */
    readonly countryWeight: number | null;
    /** 생 극단성(축별 백분위 합성)에 걸 가중치 */
    readonly lifeWeight: number | null;
    /** 합성에 쓸 축과 각 축의 비중 */
    readonly axisWeights: Record<string, number> | null;
};
/** §E 배틀 */
export declare const BATTLE: {
    /** 3축 3판 2선승 — 축 개수 */
    readonly axesPerBattle: 3;
    /** 각 축 판정에 거는 랜덤 보정 폭(±비율). §E는 "±10% 이내"라고만 한다.
     *  TODO(balance): 정확한 폭과 분포(균등/정규) 미확정. */
    readonly axisJitter: number | null;
    /** 같은 상대와의 1일 배틀 상한 (§E) */
    readonly dailyPerOpponent: 3;
};
/** 공덕(merit) 수치 — §C 추가 뽑기, §E 언더독 보상 */
export declare const MERIT: {
    /** 1일 기본 뽑기 횟수 (§C) */
    readonly dailyRolls: 3;
    /** 추가 뽑기 1회의 공덕 비용. TODO(balance) */
    readonly rerollCost: number | null;
    /** 열세 측이 이겼을 때 지급(대폭). TODO(balance) */
    readonly underdogWin: number | null;
    /** 우세 측이 이겼을 때 지급(소액). TODO(balance) */
    readonly favoriteWin: number | null;
};
/** §D 출생 번호 라운드 넘버 칭호 — 어느 번호에 줄지만 정하고 문구는 2단계에서. */
export declare const MILESTONE_BIRTH_NUMBERS: readonly [100, 1000, 10000];
//# sourceMappingURL=config.d.ts.map