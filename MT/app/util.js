export const $ = id => document.getElementById(id);
export const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

/* 팀 이름·사람 이름은 people/teams.js 에서만 온다(사용자 입력이 아니다). 그래도 innerHTML로
   그리는 곳이 있어 한 곳에서 막아 둔다 — 나중에 데이터를 서버·URL에서 받게 되면
   이 함수가 이미 끼어 있어야 사고가 안 난다. */
export const esc = s => String(s).replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
