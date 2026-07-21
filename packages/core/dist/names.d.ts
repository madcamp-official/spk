import type { CauseInput, LifeName } from "./types.js";
/** rollName 입력 — 사인과 같은 고정값 집합 + 민족(문화권 세분화용).
 *  eth는 시드에 들어가지 않는다 — 풀 선택에만 쓴다. 민족은 생의 고정값이라
 *  (링크·DB에 보존됨) 결정성은 그대로 유지된다. */
export type NameInput = CauseInput & {
    eth?: readonly [string, number];
};
export type UiLang = "ko" | "en" | "ja" | "zh" | "es" | "pt";
/** 이 생의 이름. 사인처럼 고정값에서 결정적으로 정해진다 — 같은 생은 언제나 같은 이름. */
export declare function rollName(l: NameInput): LifeName;
/** UI 언어에 맞는 주 표기. 예: 한국 생 → ko에서 "김희서", en에서 "Heeseo Kim". */
export declare function formatLifeName(name: LifeName, lang: UiLang): string;
/** 반대 표기(설명줄용). 원문자가 따로 없는 문화권은 null. */
export declare function altLifeName(name: LifeName, lang: UiLang): string | null;
/** 검증용: 어떤 문화권이 존재하고 몇 개국이 매핑됐는지 */
export declare const NAME_CULTURES: string[];
export declare function nameCultureOf(countryName: string): string | undefined;
//# sourceMappingURL=names.d.ts.map