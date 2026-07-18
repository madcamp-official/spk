import {$,reduceMotion} from "../core/util.js";

/* ===== 별 배경 ===== */
(function(){
 const cv=$("stars"),x=cv.getContext("2d");
 let stars=[];
 function resize(){
  cv.width=innerWidth;cv.height=innerHeight;
  stars=Array.from({length:Math.min(180,innerWidth/6)},()=>({
   x:Math.random()*cv.width,y:Math.random()*cv.height,
   r:Math.random()*1.4+.3,p:Math.random()*Math.PI*2,s:Math.random()*.9+.3}));
 }
 resize();
 addEventListener("resize",()=>{resize();if(reduceMotion)requestAnimationFrame(draw);});
 function draw(t){
  x.clearRect(0,0,cv.width,cv.height);
  for(const s of stars){
   const a=reduceMotion?.6:.35+.4*Math.sin(t/1400*s.s+s.p);
   x.fillStyle="rgba(236,233,245,"+a.toFixed(2)+")";
   x.beginPath();x.arc(s.x,s.y,s.r,0,7);x.fill();
  }
  if(!reduceMotion)requestAnimationFrame(draw);
 }
 requestAnimationFrame(draw);
})();

/* ===== 컨페티 ===== */
export function burstConfetti(color){
 if(reduceMotion)return;
 const cv=$("confetti"),x=cv.getContext("2d");
 cv.width=innerWidth;cv.height=innerHeight;
 const hero=$("hero").getBoundingClientRect();
 const cx=hero.left+hero.width/2,cy=Math.max(80,hero.top+60);
 const colors=[color,"#f3c95c","#ff8fb2","#b78ef0","#ece9f5"];
 const parts=Array.from({length:140},()=>({
  x:cx,y:cy,
  vx:(Math.random()-.5)*14,vy:-Math.random()*13-3,
  g:.35,r:Math.random()*5+2,rot:Math.random()*Math.PI,vr:(Math.random()-.5)*.3,
  c:colors[Math.floor(Math.random()*colors.length)],life:1}));
 let frame=0;
 (function tick(){
  frame++;x.clearRect(0,0,cv.width,cv.height);
  let alive=false;
  for(const p of parts){
   p.x+=p.vx;p.y+=p.vy;p.vy+=p.g;p.rot+=p.vr;p.life-=.008;
   if(p.life<=0||p.y>cv.height+20)continue;
   alive=true;
   x.save();x.translate(p.x,p.y);x.rotate(p.rot);
   x.globalAlpha=Math.max(0,p.life);x.fillStyle=p.c;
   x.fillRect(-p.r,-p.r/2,p.r*2,p.r);x.restore();
  }
  if(alive&&frame<260)requestAnimationFrame(tick);
  else x.clearRect(0,0,cv.width,cv.height);
 })();
}

/* ===== 토스트 ===== */
let toastT,toastT2;
export function toast(msg){
 const t=$("toast");t.textContent=msg;t.hidden=false;
 requestAnimationFrame(()=>t.classList.add("show"));
 clearTimeout(toastT);clearTimeout(toastT2);
 toastT=setTimeout(()=>{t.classList.remove("show");toastT2=setTimeout(()=>{t.hidden=true;},300);},2200);
}
