import {isoCode} from "../core/util.js";
import {TOTAL} from "../core/data.js";
import {t,countryName} from "../i18n/i18n.js";
import {ST} from "../core/state.js";
import {flagOK,FLAG_FONT} from "./flags.js";
import {encodeLife} from "../engine/permalink.js";

/* ===== 오늘의 운세 공유 카드 (미끼형) =====
   결과 카드(share.js drawCard)가 12개 항목을 전부 펼쳐 "다 설명"한다면, 이 카드는 반대다.
   운세는 날짜가 박혀야 오늘만의 것이 되고(썩는 값), 받는 사람이 "나도?" 하고 눌러야 퍼진다.
   그래서 이 카드는 궁금증만 남긴다 — 등급·오늘의 럭·운세 한 줄·"네 운세는?" + 주소.
   나라 12칸은 넣지 않는다. 받는 쪽이 확인할 방법은 링크를 여는 것뿐이라야 한다.

   두 규격을 만든다:
   · story  1080×1920 — 인스타 스토리(다운로드·네이티브 공유)
   · square 1080×1080 — 카톡·링크 미리보기용 OG 이미지(서버에 올려 /api/og로 서빙) */

/* 등급: 인구 구간·색은 data.js의 RARITY와 일치시킨다(같은 어휘를 화면·카드가 공유).
   등급 '문자'(N/R/SR/SSR/UR)가 곧 공유되는 점수다 — 흔한 생은 N(웃긴 흔함), 20만분의 1은 UR(자랑). */
const TIERS=[
 {min:100, tier:"N",   name:"흔한 생", color:"#98a0b8"},
 {min:25,  tier:"R",   name:"희귀",   color:"#6fb1e8"},
 {min:5,   tier:"SR",  name:"영웅",   color:"#b78ef0"},
 {min:0.5, tier:"SSR", name:"전설",   color:"#f3c95c"},
 {min:0,   tier:"UR",  name:"신화",   color:"#ff8fb2"},
];
export function rarityTier(pop){for(const x of TIERS)if(pop>=x.min)return x;return TIERS[TIERS.length-1];}

/* 오늘 뽑힌 나라에 태어날 확률의 역수 = "N명 중 1명꼴". 결과 그 자체의 희귀도라
   양극단이 다 시끄럽다(인도는 몇 명 중 1명, 모나코는 20만 명 중 1명). 결과 화면의
   '걸릴 확률'과 같은 값을, 사람이 바로 읽는 꼴로 뒤집은 것이다.
   (예전의 '상위 X%'는 흔한 나라에서 57%처럼 애매하게 읽혀 자랑도 웃음도 안 됐다.) */
export function fortuneOdds(l){
 const n=Math.max(1,Math.round(TOTAL/l.c.pop));
 return t("{n}명 중 1명꼴",{n:n.toLocaleString()});
}

/* key("2026-7-21") → "2026.07.21". 날짜를 카드에 크게 박아 "오늘만의 것"으로 만든다. */
function fmtDate(key){
 const p=String(key||"").split("-");
 if(p.length!==3||!p[0])return "";
 return p[0]+"."+String(p[1]).padStart(2,"0")+"."+String(p[2]).padStart(2,"0");
}

/* 이 생이 운세인지. fortune.js가 붙이는 순수 문장(fortuneMsg)으로 판정한다 —
   drawCard가 쓰는 l.fortune(접두어 포함 표시줄)과 헷갈리지 않게 이 필드를 본다. */
export const isFortune=l=>!!(l&&l.fortuneMsg);

function hexA(hex,a){const n=parseInt(hex.slice(1),16);return "rgba("+((n>>16)&255)+","+((n>>8)&255)+","+(n&255)+","+a+")";}
function roundRect(x,px,py,w,h,r){
 x.beginPath();x.moveTo(px+r,py);x.arcTo(px+w,py,px+w,py+h,r);
 x.arcTo(px+w,py+h,px,py+h,r);x.arcTo(px,py+h,px,py,r);x.arcTo(px,py,px+w,py,r);x.closePath();
}

/* size: "story"(1080×1920) | "square"(1080×1080). 콘텐츠 세로 스택을 측정 후 중앙 정렬한다 —
   나라 이름·운세 문장 길이에 따라 늘어나도 위아래로 잘리지 않게 한다. */
export function drawFortuneCard(l,size){
 const story=size!=="square";
 const W=1080,H=story?1920:1080;
 const cv=document.createElement("canvas");cv.width=W;cv.height=H;
 const x=cv.getContext("2d");
 const SANS="'Malgun Gothic','Apple SD Gothic Neo','Yu Gothic','Meiryo',sans-serif";
 const SERIF="'Nanum Myeongjo','Noto Serif KR',Batang,'Malgun Gothic','Yu Mincho',serif";
 const INK="#ece9f5",MUTED="#9a98b5",GOLD="#f3c95c";
 const tier=rarityTier(l.c.pop),RC=tier.color;
 const S=story?1:0.82;   /* 정사각형은 전체를 약간 압축한다 */
 const sp=v=>{try{x.letterSpacing=v;}catch(e){}};

 /* 배경: 심연 그라데이션 + 별 (결과·프로필 카드와 한 세트로 읽히게 동일) */
 const g=x.createLinearGradient(0,0,0,H);
 g.addColorStop(0,"#0a0d1c");g.addColorStop(.55,"#141a33");g.addColorStop(1,"#0a0d1c");
 x.fillStyle=g;x.fillRect(0,0,W,H);
 for(let i=0;i<(story?220:140);i++){x.fillStyle="rgba(236,233,245,"+(Math.random()*.7+.1)+")";
  const r=Math.random()*1.8+.4;x.beginPath();x.arc(Math.random()*W,Math.random()*H,r,0,7);x.fill();}
 /* 희귀도 색 광채 — 국기 뒤에서 번지게 해 등급이 색으로도 읽히게 */
 const glowY=H*(story?.42:.44),rad=story?560:400;
 const rg=x.createRadialGradient(W/2,glowY,0,W/2,glowY,rad);
 rg.addColorStop(0,hexA(RC,.32));rg.addColorStop(1,hexA(RC,0));
 x.fillStyle=rg;x.fillRect(0,0,W,H);

 function fitFont(text,sz,weight,fam,maxW,min){let s=sz;x.font=(weight?weight+" ":"")+s+"px "+fam;
  while(s>min&&x.measureText(text).width>maxW){s--;x.font=(weight?weight+" ":"")+s+"px "+fam;}return s;}
 function wrapChars(text,maxW,n){const out=[];let line="";
  for(const ch of String(text)){if(x.measureText(line+ch).width>maxW&&line){
   if(out.length===n-1){while(line&&x.measureText(line+"…").width>maxW)line=line.slice(0,-1);out.push(line+"…");return out;}
   out.push(line);line="";}line+=ch;}
  if(line)out.push(line);return out;}

 const cx=W/2,maxW=W-140;
 const date=fmtDate(l.fortuneKey),fmsg=l.fortuneMsg||"";
 /* 운세 줄 수를 먼저 측정해야 스택 총높이를 안다(중앙 정렬용). 아래 그릴 때와 같은 폰트로 잰다. */
 x.font=Math.round(38*S)+"px "+SERIF;
 const flines=fmsg?wrapChars("“"+fmsg+"”",maxW,story?3:2):[];

 /* 블록 높이·간격을 미리 상수로 잡아 총높이와 전진량이 어긋나지 않게 한다 */
 const gap=story?42:28;
 const hEye=Math.round(40*S),hDate=Math.round(92*S),hBadge=Math.round(96*S),
  hFlag=story?200:150,hCountry=Math.round(64*S),hLuck=Math.round(40*S),
  hFortLine=Math.round(50*S),hFort=flines.length*hFortLine,
  hCtaA=Math.round(56*S),hCtaB=Math.round(38*S);
 const total=hEye+gap*0.5+hDate+gap+hBadge+gap+hFlag+gap*0.6+hCountry+gap*0.5+hLuck
  +(flines.length?gap+hFort:0)+gap+hCtaA+8+hCtaB;
 let y=Math.max(Math.round(50*S),(H-total)/2);

 x.textAlign="center";x.textBaseline="top";

 /* 눈썹줄 + 큰 날짜(오늘만의 것이라는 신호) */
 sp(Math.round(4*S)+"px");
 x.fillStyle=GOLD;x.font="600 "+Math.round(28*S)+"px "+SANS;
 x.fillText("🔮 "+t("환생 운세"),cx,y);sp("0px");
 y+=hEye+gap*0.5;
 x.fillStyle=INK;x.font="800 "+Math.round(84*S)+"px "+SANS;
 x.fillText(date,cx,y);
 y+=hDate+gap;

 /* 등급 배지 — 공유되는 '점수'. 등급 문자를 크게, 옆에 등급 이름. 희귀도 색으로 광채·테두리. */
 const letter=tier.tier,name=t(tier.name);
 const lf=Math.round(64*S),nf=Math.round(30*S);
 x.font="900 "+lf+"px "+SANS;const lw=x.measureText(letter).width;
 x.font="700 "+nf+"px "+SANS;const nw=x.measureText(name).width;
 const padX=Math.round(30*S),innerGap=Math.round(18*S);
 const bw=padX*2+lw+innerGap+nw,bx=cx-bw/2;
 x.save();x.shadowColor=RC;x.shadowBlur=Math.round(40*S);
 x.fillStyle=hexA(RC,.16);roundRect(x,bx,y,bw,hBadge,hBadge/2);x.fill();x.restore();
 x.strokeStyle=RC;x.lineWidth=Math.max(2,Math.round(3*S));roundRect(x,bx,y,bw,hBadge,hBadge/2);x.stroke();
 x.textAlign="left";x.textBaseline="middle";
 x.fillStyle=RC;x.font="900 "+lf+"px "+SANS;x.fillText(letter,bx+padX,y+hBadge/2+2);
 x.fillStyle=INK;x.font="700 "+nf+"px "+SANS;x.fillText(name,bx+padX+lw+innerGap,y+hBadge/2+2);
 x.textAlign="center";x.textBaseline="top";
 y+=hBadge+gap;

 /* 국기(미지원이면 희귀도 색 원형 ISO 배지) — 유일하게 드러내는 결과의 얼굴 */
 if(flagOK){
  x.font=hFlag+"px "+FLAG_FONT;x.fillText(l.c.flag,cx,y);
 }else{
  const r=hFlag*0.42,cyf=y+hFlag/2;
  x.strokeStyle=RC;x.lineWidth=6;x.beginPath();x.arc(cx,cyf,r,0,7);x.stroke();
  x.fillStyle="#1c2445";x.beginPath();x.arc(cx,cyf,r-3,0,7);x.fill();
  x.fillStyle=RC;x.font="800 "+Math.round(r*0.9)+"px 'Segoe UI',sans-serif";
  x.textBaseline="middle";x.fillText(isoCode(l.c.flag),cx,cyf);x.textBaseline="top";
 }
 y+=hFlag+gap*0.6;

 /* 나라 이름(serif) */
 x.fillStyle=INK;fitFont(countryName(l.c),Math.round(58*S),"800",SERIF,maxW,Math.round(30*S));
 x.fillText(countryName(l.c),cx,y);
 y+=hCountry+gap*0.5;

 /* 결과의 희귀도 — N명 중 1명꼴 (등급 이름은 바로 위 배지에 있으므로 여기선 숫자만) */
 x.fillStyle=MUTED;
 const luck=fortuneOdds(l);
 fitFont(luck,Math.round(30*S),"",SANS,maxW,Math.round(20*S));
 x.fillText(luck,cx,y);
 y+=hLuck+(flines.length?gap:0);

 /* 운세 한 줄(짧은 미끼) */
 if(flines.length){
  x.fillStyle="#d9c8f2";x.font=Math.round(38*S)+"px "+SERIF;
  flines.forEach((ln,i)=>x.fillText(ln,cx,y+i*hFortLine));
  y+=hFort+gap;
 }

 /* CTA — "네 운세는?" + 주소. 링크를 여는 것 말고 비교할 방법이 없게. */
 x.fillStyle=GOLD;x.font="800 "+Math.round(46*S)+"px "+SANS;
 x.fillText(t("네 운세는?"),cx,y);
 y+=hCtaA+8;
 x.fillStyle=MUTED;x.font=Math.round(30*S)+"px "+SANS;
 x.fillText(location.host||"life-reroll.com",cx,y);

 return cv;
}

/* 결과별 OG 랜딩(/s/코드). 코드가 있으면 크롤러가 이 생의 카드를 미리보기로 읽는다.
   코드가 없으면(서버 다운·미서명 운세) 생 없는 링크로 떨어진다 — 받는 쪽은 첫 화면을 본다.
   ref·via·v는 결과 카드 공유와 같은 규약으로 실어 채널별 바이럴을 따로 집계한다. */
export function fortuneShareURL(via,code){
 let u=location.origin+(code?("/s/"+code):location.pathname)+"?ref=share&v="+ST.ab;
 if(via)u+="&via="+via;
 return u;
}

/* 공유 문구도 카드와 같은 미끼 규칙 — 등급·럭·운세 한 줄·"네 운세는?"만. 12개 항목은 넣지 않는다. */
export function fortuneTeaseText(l,via,code){
 const tier=rarityTier(l.c.pop);
 const lines=[
  "🔮 "+t("{date}의 환생 운세",{date:fmtDate(l.fortuneKey)}),
  tier.tier+" · "+fortuneOdds(l)+" · "+t(tier.name),
  ...(l.fortuneMsg?["“"+l.fortuneMsg+"”"]:[]),
  "",
  t("네 운세는? 👉 {url}",{url:fortuneShareURL(via,code)}),
 ];
 return lines.join("\n");
}

/* 운세를 서버에 등록하고 짧은 코드를 받는다 — 결과별 OG 이미지(정사각형)를 함께 올린다.
   이미지가 무거우니 채널마다 다시 올리지 않게 코드를 이 생에 캐시한다(l._fcode).
   서명이 없으면(로컬·미서명) null → 호출부가 생 없는 링크로 떨어진다. */
export async function registerFortuneShare(l){
 if(l._fcode!==undefined)return l._fcode;
 if(!l||!l.sig){l._fcode=null;return null;}
 let og="";
 try{og=drawFortuneCard(l,"square").toDataURL("image/jpeg",0.82);}catch(e){}
 const tier=rarityTier(l.c.pop);
 const title="🔮 "+t("{date}의 환생 운세",{date:fmtDate(l.fortuneKey)})+" · "+tier.tier;
 const desc=fortuneOdds(l)+" · "+t(tier.name)
  +(l.fortuneMsg?(" · “"+l.fortuneMsg+"”"):"");
 try{
  const r=await fetch("/api/fortune-share",{method:"POST",cache:"no-store",
   headers:{"content-type":"application/json"},
   body:JSON.stringify({l:encodeLife(l),sig:l.sig,og,t:title,d:desc})});
  if(!r.ok){l._fcode=null;return null;}
  const d=await r.json();
  l._fcode=typeof d.code==="string"?d.code:null;
  return l._fcode;
 }catch(e){l._fcode=null;return null;}
}

export function downloadFortuneCard(l){
 drawFortuneCard(l,"story").toBlob(b=>{
  if(!b)return;
  const a=document.createElement("a");
  a.href=URL.createObjectURL(b);
  a.download="fortune-"+(l.fortuneKey||"")+"-"+isoCode(l.c.flag)+".png";
  a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),4000);
 },"image/png");
}
