/* ===== 코어 타입 =====
   DiscordBot.md §D(생 샘플링)·§G(DB 스키마)를 웹의 기존 구조와 맞춘 정의다.

   ⚠ 필드명은 **기존 웹 이름을 그대로 쓴다**(lifeExp·income·top·prob…).
   §G의 컬럼명(lifespan·income_mult…)과 다르지만, 이름을 바꾸면 render·share·dex·
   titles·permalink·analytics가 전부 연쇄 수정돼 "웹 회귀 0"이 깨진다.
   §G ↔ 여기의 대응은 각 필드 주석에 적어 두었고, DB 매핑은 봇(2단계)이 담당한다. */

export type ContinentCode = "AS" | "EU" | "AF" | "NA" | "SA" | "OC";

/** [이름, 비율(%)] — 종교·민족처럼 국가 안에서 가중 추첨되는 항목.
 *  이름은 한국어이며 웹 i18n 사전의 키다(data.ts 머리말 참고). */
export type WeightedPair = [string, number];

export interface RarityTier {
  /** 이 색이 적용되는 최소 인구(백만) */
  min: number;
  color: string;
}

export interface Country {
  /** 한국어 국가명. i18n은 국기→ISO→Intl.DisplayNames로 번역하므로 사전이 없다. */
  name: string;
  /** 국기 이모지. ISO 코드(§G country_code)는 isoCode()로 파생한다. */
  flag: string;
  /** 인구(백만 명). 국가 추첨 가중치이자 국가 희귀도의 원천. */
  pop: number;
  /** 도시화율(%) — §D 도시/농촌 베르누이 */
  urban: number;
  /** 기대수명(년) — §D 수명 정규분포의 평균 */
  life: number;
  /** 1인당 GDP(USD) — §D 소득 로그정규의 중앙값 */
  gdp: number;
  /** 대표 언어(한국어 표기, i18n 사전 키) */
  lang: string;
  /** 종교 프로필 키 → REL[rel] */
  rel: string;
  cont: ContinentCode;
  /** 남성 평균 키(cm) */
  hm: number;
  /** 여성 평균 키(cm) */
  hf: number;
  /** 성인 평균 BMI */
  bmi: number;
  /** 민족 구성 */
  eth: WeightedPair[];

  /* ── §D 미보유 필드 (2단계) ────────────────────────────────
     데이터셋에 값이 없어 선언하지 않는다. 추가할 때 출처(UN WPP/World Bank)를 명시할 것.
       fertility?: number   — 합계출산율. §D 형제 수(포아송)의 λ
       sexRatio?:  number   — 국가별 출생 성비. 지금은 전역 SAMPLING.pMale만 있다 */
}

/** 한 번의 환생 결과. rollLife()의 반환형. */
export interface Life {
  /** DATA 인덱스 */
  ci: number;
  c: Country;
  male: boolean;
  urban: boolean;
  /** 뽑힌 종교 [이름, %] */
  rel: WeightedPair;
  /** 뽑힌 민족 [이름, %] */
  eth: WeightedPair;
  balding: boolean;
  /** 사망 원인. 이 생의 고정값에서 결정적으로 정해진다(roll.ts rollCause 참고) */
  cause: Cause;
  /** 기대수명(년) — §G lifespan */
  lifeExp: number;
  /** 연 소득(USD) — §G income_mult 는 이 값과 국가 중위의 비로 산출한다(2단계) */
  income: number;
  /** 세계 소득 상위 %(0.01~99.9) */
  top: number;
  iq: number;
  /** cm */
  height: number;
  /** kg */
  weight: number;
  bmi: number;
  /** 이 생이 나올 확률 = 국가 × 성별 × 도시/농촌 */
  prob: number;

  /** 서버가 서명한 생에만 붙는다(공유 링크 위조 방지). 클라이언트 로컬 생에는 없다. */
  sig?: string;
  /** 오늘의 운세 문구(웹 전용) */
  fortune?: string;

  /* ── §D 미구현 (2단계) ──────────────────────────────────── */
  /** 형제 수 — 국가 출산율 포아송. 데이터 부재로 미구현 */
  siblings?: number;
  /** 직업군 — 소득수준별 정적 테이블. 미구현 */
  occupation?: string;
  /** 특성 태그(「장수」「대가족」…) — 업 계승 대상 */
  traits?: Trait[];
  /** 생 희귀도 점수 — 축별 국가 내 백분위 합성 × 국가 확률 */
  rarityScore?: number;
}

/** §D 특성 태그. 업 계승(§C /환생)의 이월 단위.
 *  태그 목록과 파생 규칙은 2단계에서 확정한다 — 지금 임의로 정하지 않는다. */
export interface Trait {
  /** 안정적인 식별자(로케일 무관). 예: "longevity" */
  key: string;
  /** 이 태그가 붙은 근거 축. 예: "lifeExp" */
  axis?: LifeAxis;
}

/** §E 배틀 판정 축. 값이 큰 쪽이 이기며, 희귀도만 낮은 확률 쪽이 이긴다. */
export type LifeAxis = "lifeExp" | "income" | "siblings" | "pop" | "rarity";

/** 사망 원인. key는 한국어이며 i18n 사전의 키다(웹이 번역한다) — 정규화하지 말 것. */
export interface Cause {
  key: string;
  emoji: string;
}

/** rollCause가 필요로 하는 최소 필드. Life 전체를 요구하지 않아
 *  순환(생을 만들려면 사인이, 사인을 구하려면 생이) 없이 계산된다. */
export interface CauseInput {
  c: Country;
  male: boolean;
  lifeExp: number;
  income: number;
  iq: number;
  height: number;
  weight: number;
}
