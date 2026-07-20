/* ===== 코어 타입 =====
   DiscordBot.md §D(생 샘플링)·§G(DB 스키마)를 웹의 기존 구조와 맞춘 정의다.

   ⚠ 필드명은 **기존 웹 이름을 그대로 쓴다**(lifeExp·income·top·prob…).
   §G의 컬럼명(lifespan·income_mult…)과 다르지만, 이름을 바꾸면 render·share·dex·
   titles·permalink·analytics가 전부 연쇄 수정돼 "웹 회귀 0"이 깨진다.
   §G ↔ 여기의 대응은 각 필드 주석에 적어 두었고, DB 매핑은 봇(2단계)이 담당한다. */
export {};
//# sourceMappingURL=types.js.map