import type { Country, ContinentCode, WeightedPair, RarityTier } from "./types.js";
export declare const REL: Record<string, WeightedPair[]>;
export declare const CONT_NAME: Record<ContinentCode, string>;
export declare const RARITY: RarityTier[];
export declare const P_MALE: 0.512, SIGMA: 0.75;
export declare const DATA: Country[];
export declare const TOTAL: number;
export declare const CUM: number[];
export declare function countryByCode(code: string): Country | undefined;
/** DATA에서의 위치. 도감 정렬·저장에 쓴다. */
export declare function countryIndex(c: Country): number;
//# sourceMappingURL=data.d.ts.map