import type { Country, Life, Trait } from "./types.js";
/** 인구 가중 국가 추첨. CUM(누적 인구)에 이분 탐색. */
export declare function pickCountryIdx(): number;
/** 이 소득이 세계 상위 몇 %인지. 모든 국가의 로그정규를 인구로 가중해 합친다. */
export declare function incomeTopPct(v: number): number;
export declare function rarityColor(pop: number): string;
export declare function rollBody(c: Country, male: boolean): {
    height: number;
    weight: number;
    bmi: number;
};
export declare function rollIQ(): number;
export declare function iqTopPct(iq: number): number;
/** 생 한 번 뽑기. fCi/fMale을 주면 그 값으로 고정한다(공유 링크 복원·운세용). */
export declare function rollLife(fCi?: number | null, fMale?: boolean | null): Life;
/** §D 형제 수 — 국가 합계출산율을 λ로 하는 포아송.
 *  막힌 이유: 데이터셋에 출산율이 없다(Country.fertility 부재).
 *  TODO(2단계): UN WPP에서 합계출산율을 받아 Country에 추가하고 SAMPLING.siblingsLambda 정리. */
export declare function rollSiblings(_c: Country): number;
/** §D 직업군 — 소득수준별 정적 테이블에서 선택. 인생 요약(§F)의 입력.
 *  막힌 이유: 직업군 테이블 자체가 없고, 톤 가이드(§F)상 문구 검토가 선행돼야 한다.
 *  TODO(2단계): 소득 구간 × 도시/농촌 테이블 정의. */
export declare function rollOccupation(_life: Life): string;
/** §D 특성 태그 — 지금 뽑고 있는 값에서만 파생한다(새 데이터 0).
 *  「대가족」은 형제 수가 필요해 아직 없다 — 출산율 데이터가 생기면 여기 추가한다.
 *  임계값은 전부 config.TRAITS(§A.8). 태그는 전부 긍정형이다(§F 톤 가이드). */
export declare function deriveTraits(life: Life): Trait[];
/** 업 계승으로 물려받을 수 있는 태그 목록(고정 순서). 버튼을 만들 때 쓴다. */
export declare const TRAIT_KEYS: readonly ["longevity", "wealth", "rare_land", "genius", "lefty"];
export type TraitKey = typeof TRAIT_KEYS[number];
export declare function hasTrait(life: Life, key: string): boolean;
/** §D 생 희귀도 점수 = "이 생보다 희귀한 생이 나올 확률". ×100 하면 "상위 n%".
 *  값이 작을수록 희귀하다. 공식과 계수는 config.RARITY_SCORE 참고.
 *
 *  ⚠ Life.prob(국가×성별×도시)과는 다른 값이다 — prob은 "이 조합이 나올 확률"이고
 *  이건 국가 확률에 스탯 극단성까지 곱한 것이다. 서로 대체하지 말 것. */
export declare function rarityScore(life: Life): number;
/** §C 업 계승 — 주어진 특성을 가진 생이 나올 때까지 다시 뽑는다(기각 표집).
 *  상한(config.KARMA.maxResamples) 안에 못 찾으면 마지막 생을 그대로 돌려주고
 *  inherited:false 로 알린다 — 실패를 성공인 척하지 않는다. */
export declare function rollLifeWithTrait(traitKey: string): {
    life: Life;
    inherited: boolean;
    tries: number;
};
//# sourceMappingURL=roll.d.ts.map