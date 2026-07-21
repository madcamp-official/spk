/* ===== @life-reroll/core =====
   국가 데이터 · 생 샘플링 · 확률. 플랫폼 무관 순수 로직만 둔다.
   소비자: apps/web(브라우저), server/counter.js(node), apps/bot(2단계).

   ⚠ 이 패키지는 DOM·Discord·Next.js 어느 것도 알아서는 안 된다(DiscordBot.md §A.3).
   package.json의 dependencies가 비어 있는 것이 그 증명이다.

   브라우저는 번들러 없이 URL로 모듈을 푼다. 그래서 상대 import에 **반드시 .js 확장자**를
   붙인다(TS 소스에서도). 확장자를 빼면 tsc는 통과하지만 브라우저에서 404가 난다. */
export * from "./types.js";
export * from "./config.js";
export * from "./util.js";
export * from "./data.js";
export * from "./roll.js";
export * from "./names.js";
export * from "./battle.js";
//# sourceMappingURL=index.js.map