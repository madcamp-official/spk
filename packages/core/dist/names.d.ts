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
/** UI 언어에 맞는 주 표기.
 *  한국 생: ko 김희서 · en Heeseo Kim / 미국 생: ko 피터 밀러 · ja ピーター・ミラー.
 *  한자 문화권끼리는 원문자를 공유한다(중국 이름은 ja에서, 일본 이름은 zh에서 한자 그대로).
 *  en·es·pt는 라틴 문자 언어라 음역하지 않는다 — 로마자가 그 언어의 표준 표기다. */
export declare function formatLifeName(name: LifeName, lang: UiLang): string;
/** 반대 표기(설명줄용). 주 표기가 음역·원문자면 로마자를, 로마자면 원문자를 준다. */
export declare function altLifeName(name: LifeName, lang: UiLang): string | null;
/** 검증용: 사전에 없는(로마자로 폴백하는) 조각 목록. 비어 있어야 한다. */
export declare function missingTransliterations(): string[];
export declare function nameCultureOf(countryName: string): string | undefined;
//# sourceMappingURL=names.d.ts.map