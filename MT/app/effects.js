import {$, reduceMotion} from "./util.js";

/* 별 배경·컨페티. 환생 시뮬레이터(apps/web/app/ui/effects.js)와 같은 연출이다 —
   "기존 UI를 따라간다"가 요구사항이라 값을 그대로 옮겼다.
   토스트는 공유 기능과 함께 걷어냈다(부를 곳이 없어졌다). */

/* ===== 별 배경 ===== */
(function () {
  const cv = $("stars"), x = cv.getContext("2d");
  let stars = [];
  function resize() {
    cv.width = innerWidth; cv.height = innerHeight;
    stars = Array.from({length: Math.min(180, innerWidth / 6)}, () => ({
      x: Math.random() * cv.width, y: Math.random() * cv.height,
      r: Math.random() * 1.4 + .3, p: Math.random() * Math.PI * 2, s: Math.random() * .9 + .3}));
  }
  resize();
  addEventListener("resize", () => { resize(); if (reduceMotion) requestAnimationFrame(draw); });
  function draw(t) {
    x.clearRect(0, 0, cv.width, cv.height);
    for (const s of stars) {
      const a = reduceMotion ? .6 : .35 + .4 * Math.sin(t / 1400 * s.s + s.p);
      x.fillStyle = "rgba(236,233,245," + a.toFixed(2) + ")";
      x.beginPath(); x.arc(s.x, s.y, s.r, 0, 7); x.fill();
    }
    if (!reduceMotion) requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);
})();

/* ===== 컨페티 ===== */
export function burstConfetti(color) {
  if (reduceMotion) return;
  const cv = $("confetti"), x = cv.getContext("2d");
  cv.width = innerWidth; cv.height = innerHeight;
  const hero = $("hero").getBoundingClientRect();
  const cx = hero.left + hero.width / 2, cy = Math.max(80, hero.top + 60);
  const colors = [color, "#f3c95c", "#ff8fb2", "#b78ef0", "#ece9f5"];
  const parts = Array.from({length: 140}, () => ({
    x: cx, y: cy,
    vx: (Math.random() - .5) * 14, vy: -Math.random() * 13 - 3,
    g: .35, r: Math.random() * 5 + 2, rot: Math.random() * Math.PI, vr: (Math.random() - .5) * .3,
    c: colors[Math.floor(Math.random() * colors.length)], life: 1}));
  let frame = 0;
  (function tick() {
    frame++; x.clearRect(0, 0, cv.width, cv.height);
    let alive = false;
    for (const p of parts) {
      p.x += p.vx; p.y += p.vy; p.vy += p.g; p.rot += p.vr; p.life -= .008;
      if (p.life <= 0 || p.y > cv.height + 20) continue;
      alive = true;
      x.save(); x.translate(p.x, p.y); x.rotate(p.rot);
      x.globalAlpha = Math.max(0, p.life); x.fillStyle = p.c;
      x.fillRect(-p.r, -p.r / 2, p.r * 2, p.r); x.restore();
    }
    if (alive && frame < 260) requestAnimationFrame(tick);
    else x.clearRect(0, 0, cv.width, cv.height);
  })();
}

/* ===== 효과음 =====
   BGM과 채널(Audio 객체)을 나눈다 — 하나를 돌려쓰면 리롤 클릭음이 히든 팀 BGM을 끊는다.
   BGM과 달리 미리 받아 둔다: 15KB로 가볍고, 첫 클릭에 소리가 늦으면 클릭음의 의미가 없다.
   (BGM은 파일명 자체가 스포일러라 히든을 만나기 전엔 요청조차 보내지 않는다.) */
const sfx = new Map();
export function preloadSFX(src) { if (!sfx.has(src)) sfx.set(src, new Audio(src)); }
export function playSFX(src) {
  preloadSFX(src);
  const a = sfx.get(src);
  a.currentTime = 0;   /* 연타해도 매번 처음부터 — 클릭음은 겹치는 것보다 끊기는 게 자연스럽다 */
  a.play().catch(() => {});
}

/* ===== BGM =====
   한 번에 한 트랙만 흐르는 채널 하나. 트랙별 Audio 는 처음 필요할 때 만들어 재사용한다 —
   페이지를 열자마자 만들면 히든 팀을 영영 못 만날 사람도 그 곡을 내려받는데,
   파일명 자체가 스포일러다. 효과음(playSFX)은 별도 채널이라 여기에 안 걸린다. */
const tracks = new Map();
let current = null;
export function playBGM(src) {
  let a = tracks.get(src);
  if (!a) { a = new Audio(src); tracks.set(src, a); }
  /* 다른 곡이 흐르고 있었으면 먼저 끈다 — 두 곡이 겹치면 둘 다 안 들린다. */
  if (current && current !== a) { current.pause(); current.currentTime = 0; }
  current = a;
  a.currentTime = 0;
  /* 브라우저는 사용자 조작 없이 소리를 못 낸다. 버튼을 눌러 뽑은 경우는 통과하지만
     ?t= 링크로 바로 들어온 경우는 막힌다 — 그때는 조용히 넘어간다(콘솔에 빨간 줄을
     남기지 않는다). 화면은 이미 다 그려져 있으므로 잃는 것은 소리뿐이다. */
  a.play().catch(() => {});
}
export function stopBGM() {
  if (!current) return;
  current.pause();
  current.currentTime = 0;
  current = null;
}
