import {DATA} from "../../core/data.js";
import {$} from "../core/util.js";
import {t,countryName} from "../i18n/i18n.js";
import {flagHTML} from "./flags.js";

/* ===== 지금 다른 사람들 (실시간 환생 피드) =====
   서버(/api/recent)가 들고 있는 "진짜 남의 리롤"을 한 줄씩 흘려보낸다. 지어낸 이벤트가
   아니라서 조용한 시간대엔 갱신이 느려지고, 그게 맞다 — 멈춰 보이면 실제로 아무도
   안 굴리고 있는 것이다. 그래서 빈 자리를 시뮬레이션으로 메우지 않는다.

   서버는 나라를 한국어 원문으로 준다(DATA의 name). 여기서 되찾아 보는 사람 언어와
   국기로 옮긴다 — 서버에 6개 언어 사전을 두지 않으려는 것. */
const BY_NAME=new Map(DATA.map(c=>[c.name,c]));
const POLL_MS=15000;   /* 관측된 리롤 간격이 평균 10초 안팎이라 이 주기면 큐가 마르지 않는다 */
const STEP_MS=3500;    /* 한 줄을 보여주는 시간 */
const MAX_Q=12;

let queue=[],shown=null,lastI=0,stepAt=0;

/* 서버가 준 ago(초)를 받은 즉시 절대 시각으로 바꿔 둔다. 그래야 큐에서 기다린
   시간까지 나이에 반영돼 "12초 전"이 화면에 뜬 채로 굳지 않는다. */
function absorb(r){return {c:r.c,i:r.i,at:Date.now()-r.ago*1000};}

function agoText(at){
 const s=Math.max(0,Math.round((Date.now()-at)/1000));
 if(s<5)return t("방금");
 if(s<60)return t("{n}초 전",{n:s});
 return t("{n}분 전",{n:Math.floor(s/60)});
}

function paint(){
 const el=$("liveFeed");
 if(!el||!shown)return;
 const c=BY_NAME.get(shown.c);
 if(!c){el.hidden=true;return;}   /* 데이터가 갈린 이름 — 지어내느니 아무 말도 안 한다 */
 el.innerHTML=t("{flag}{country}에서 누군가 환생했습니다",
  {flag:flagHTML(c)+" ",country:countryName(c)})+
  ' <span class="lf-ago">'+agoText(shown.at)+"</span>";
 el.hidden=false;
}

async function poll(){
 try{
  const r=await fetch("/api/recent?n="+MAX_Q,{cache:"no-store"});
  if(!r.ok)return;
  const d=await r.json();
  /* i는 서버가 매기는 증가 번호다. 이걸로 거르지 않으면 폴링마다 같은 리롤이
     다시 흘러 "방금 환생했습니다"가 반복된다 — 없는 사건을 지어내는 셈이 된다. */
  const fresh=(d.rolls||[]).filter(x=>x&&x.i>lastI).sort((a,b)=>a.i-b.i);
  if(!fresh.length)return;
  lastI=fresh[fresh.length-1].i;
  for(const x of fresh)queue.push(absorb(x));
  if(queue.length>MAX_Q)queue.splice(0,queue.length-MAX_Q);
 }catch(e){}   /* 서버가 없어도 페이지는 그대로 돌아간다 */
}

/* 1초마다 나이만 다시 그리고, STEP_MS가 지났고 다음 줄이 있으면 넘긴다.
   큐가 비면 마지막 줄을 그대로 두고 나이만 올린다 — 진짜 피드라 그게 정직하다. */
function tick(){
 const now=Date.now();
 if(queue.length&&(!shown||now-stepAt>=STEP_MS)){shown=queue.shift();stepAt=now;}
 paint();
}

poll();
setInterval(poll,POLL_MS);
setInterval(tick,1000);
