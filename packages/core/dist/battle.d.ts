/** 배틀에 필요한 값만 추린 것. core의 Life도, DB에서 되살린 기록도 이 모양으로 맞춰 넘긴다. */
export interface BattleStats {
    /** 출생 번호 */
    id: number;
    lifeExp: number;
    /** 연 소득(USD) */
    income: number;
    /** 모국 인구(백만) */
    pop: number;
    /** 희귀도 점수 — 작을수록 희귀 */
    rarityScore: number;
}
export type BattleAxis = "lifeExp" | "income" | "pop" | "rarity";
export declare const AXES: readonly BattleAxis[];
/** 축의 비교값. **항상 클수록 이긴다**로 통일한다 —
 *  희귀도만 "낮은 확률 쪽 승"(§E)이라 역수를 취해 방향을 맞춘다. */
export declare function axisValue(s: BattleStats, axis: BattleAxis): number;
/** 축 n개를 중복 없이 뽑는다 (§E "랜덤 3축") */
export declare function drawAxes(n?: number): BattleAxis[];
/** 한 축의 사전 승률 — P(A의 보정값 > B의 보정값).
 *
 *  보정은 균등분포 U(1-j, 1+j)를 값에 곱한다. 두 균등분포 비율의 확률을
 *  수치적분으로 구한다(난수를 쓰지 않는다 — 사전 승률이 매번 달라지면 보상 판정이 흔들린다). */
export declare function axisWinProb(vA: number, vB: number, jitter?: number): number;
/** 3판 2선승의 종합 기대 승률 (§E "축별 사전 승률로 종합 기대 승률 계산") */
export declare function matchWinProb(axisProbs: number[]): number;
export interface RoundResult {
    axis: BattleAxis;
    rawA: number;
    rawB: number;
    /** 보정이 적용된 값 */
    adjA: number;
    adjB: number;
    winner: "a" | "b";
    /** 보정 전이라면 졌을 쪽이 이겼는가 (연출용) */
    flipped: boolean;
}
export interface BattleResult {
    axes: BattleAxis[];
    rounds: RoundResult[];
    scoreA: number;
    scoreB: number;
    winner: "a" | "b";
    /** A가 배틀 전에 가졌던 종합 기대 승률 */
    priorA: number;
    /** 이긴 쪽의 사전 기대 승률 */
    priorWinner: number;
    /** 이긴 쪽이 열세였는가 (§E 언더독 보상) */
    upset: boolean;
    /** 2-1이면 접전 */
    close: boolean;
}
/** 배틀 한 판. 축은 넘기지 않으면 여기서 뽑는다. */
export declare function resolveBattle(a: BattleStats, b: BattleStats, axes?: BattleAxis[]): BattleResult;
/** 뽑힌 축들에 가장 잘 맞는 생을 덱에서 고른다 (§E "축별 최적 자동 선발").
 *
 *  상대 덱을 모르는 상태에서 고르므로, **내 덱 안에서의 축별 순위**를 합산해 뽑는다.
 *  (상대를 보고 고르면 후공이 항상 유리해져 비동기 대결이 성립하지 않는다.)
 *  동점이면 출생 번호가 빠른 쪽 — 오래된 생이 우선이라 결과가 재현된다. */
export declare function pickBestLife<T extends BattleStats>(deck: T[], axes: BattleAxis[]): T | null;
//# sourceMappingURL=battle.d.ts.map