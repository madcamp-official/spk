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
/** §D 생 희귀도 점수 — 축별 국가 내 백분위 합성 × 국가 확률. 표기는 "상위 n%".
 *
 *  점수의 뜻: **"이 생보다 희귀한 생이 나올 확률"**. 그래서 값이 작을수록 희귀하고,
 *  100을 곱하면 그대로 "상위 n%"가 된다(별도 환산표가 필요 없다).
 *    score = P(국가)^countryWeight × Π P(축이 이만큼 극단적일 확률)^lifeWeight
 *  축 극단성은 양쪽 꼬리를 본다 — 아주 크거나 아주 작거나 둘 다 드문 일이다.
 *
 *  TODO(balance): 아래 세 값은 제안 초기값이다. 중립(1.0)에서 시작해
 *  실제 분포를 보고 조정할 것 — countryWeight를 올리면 소국 출생이, lifeWeight를
 *  올리면 극단적 스탯이 더 희귀하게 잡힌다. */
export declare const RARITY_SCORE: {
    /** 국가 뽑힐 확률에 걸 지수. 1 = 그대로 반영 */
    readonly countryWeight: number | null;
    /** 생 극단성에 걸 지수. 1 = 그대로 반영 */
    readonly lifeWeight: number | null;
    /** 합성에 쓸 축과 비중. 키는 국가 평균이 있어 "국가 내 백분위"를 낼 수 있는 축만.
     *  소득·수명은 서사에 크게 걸려 동등하게, 키는 절반만 준다. */
    readonly axisWeights: Record<string, number> | null;
};
/** §D 특성 태그 — 업 계승(§C)의 이월 단위.
 *
 *  ⚠ 데이터가 없어 「대가족」(형제 수)은 아직 만들 수 없다. 여기 있는 것은 전부
 *  지금 core가 이미 뽑고 있는 값에서 파생한 것뿐이다(새 데이터 0).
 *
 *  ⚠ 톤 가이드(§F): 저소득·단명을 태그로 만들지 않는다. "꽝"으로 읽히는 이름표를
 *  붙이는 순간 그 생이 덱의 자산이 아니라 실패가 된다. 그래서 태그는 전부 긍정형이고,
 *  태그가 하나도 없는 생도 결과 화면에서 결핍처럼 보이지 않게 렌더한다.
 *
 *  TODO(balance): 임계값은 제안 초기값이다. 태그가 너무 흔하면 이월 선택이 무의미해지고,
 *  너무 드물면 버튼이 대부분 비어 보인다. 실제 발생률을 보고 조정할 것. */
export declare const TRAITS: {
    /** 기대수명(년) 이상이면 「장수」 */
    readonly longevityMinYears: 85;
    /** 세계 소득 상위 % 이내면 「부」 */
    readonly wealthTopPct: 10;
    /** 모국 인구(백만) 미만이면 「희귀한 고향」 */
    readonly rareLandMaxPopM: 30;
    /** IQ 이상이면 「명석」 */
    readonly geniusMinIq: 120;
};
/** §C 업 계승 — 직전 생의 특성 1개를 물려받아 다음 생을 뽑는다.
 *  구현은 기각 표집(그 특성이 나올 때까지 다시 뽑기)이라 상한이 필요하다. */
export declare const KARMA: {
    /** 이 횟수 안에 특성이 안 나오면 마지막 생을 그대로 쓴다(계승 실패를 솔직히 알린다).
     *  TODO(balance): 태그별 실제 발생률을 보고 조정. 뽑기는 순수 계산이라 수백 회도 즉시 끝난다. */
    readonly maxResamples: 500;
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
    /** 추가 뽑기 1회의 공덕 비용.
     *  TODO(balance): 제안 초기값 10. 공덕을 버는 유일한 통로가 아직 배틀(4단계)뿐이라,
     *  이 값은 배틀 보상(underdogWin·favoriteWin)이 정해진 뒤 함께 다시 봐야 한다. */
    readonly rerollCost: number | null;
    /** 열세 측이 이겼을 때 지급(대폭). TODO(balance) */
    readonly underdogWin: number | null;
    /** 우세 측이 이겼을 때 지급(소액). TODO(balance) */
    readonly favoriteWin: number | null;
};
/** §D 출생 번호 라운드 넘버 칭호 — 어느 번호에 줄지만 정하고 문구는 2단계에서. */
export declare const MILESTONE_BIRTH_NUMBERS: readonly [100, 1000, 10000];
//# sourceMappingURL=config.d.ts.map