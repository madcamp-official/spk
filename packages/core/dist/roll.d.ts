import type { Country, Life } from "./types.js";
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
/** §D 특성 태그 — 위 조합에서 파생(「장수」「대가족」…). 업 계승(§C)의 이월 단위.
 *  TODO(2단계): 태그 목록·임계값 확정. 임계값은 밸런스 수치이므로 config.ts에 둘 것. */
export declare function deriveTraits(_life: Life): import("./types.js").Trait[];
/** §D 생 희귀도 점수 — 축별 국가 내 백분위 합성 × 국가 확률. 표기는 "상위 n%".
 *  막힌 이유: 합성 공식이 미정이다(RARITY_SCORE의 계수가 전부 null).
 *  참고: 지금 웹이 쓰는 Life.prob(국가×성별×도시)은 이것과 다른 값이다 — 대체하지 말 것. */
export declare function rarityScore(_life: Life): number;
//# sourceMappingURL=roll.d.ts.map