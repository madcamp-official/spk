export declare const rand: () => number;
/** 오늘의 운세만 날짜 시드 난수로 갈아끼웠다가 되돌린다 */
export declare function setRNG(f: () => number): void;
export declare function mulberry32(seed: number): () => number;
export declare function strHash(s: string): number;
/** 표준정규 난수 (Box–Muller) */
export declare function gauss(): number;
export declare function erf(x: number): number;
/** 표준정규 누적분포 */
export declare const phi: (x: number) => number;
/** [값, 가중치] 쌍에서 가중 추첨 */
export declare function pickWeighted<T extends [string, number]>(pairs: T[]): T;
export declare function clamp(v: number, a: number, b: number): number;
/** 국기 이모지 → ISO 3166-1 alpha-2 (§G country_code).
 *  데이터셋에 코드 컬럼을 따로 두지 않고 국기에서 파생한다 — 두 값이 어긋날 수 없다. */
export declare function isoCode(flag: string): string;
//# sourceMappingURL=util.d.ts.map