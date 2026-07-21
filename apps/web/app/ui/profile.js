import {$} from "../core/util.js";
import {ST,session} from "../core/state.js";
import {t,contName} from "../i18n/i18n.js";
import {topTitle,earned,dexProgress,contProgress,rarestProb} from "../engine/titles.js";
import {tname} from "./titlechip.js";
import {track} from "../analytics/track.js";
import {toast} from "./effects.js";
import {roundRect,copyText,loadKakao,closeShare} from "./share.js";

/* ===== 영혼 프로필 공유 =====
   결과 카드가 "이번 한 생"을 내보낸다면, 이쪽은 "지금까지 쌓은 나"를 내보낸다 —
   환생 총수·도감 진행·최고 희귀 기록·대륙별 정복·보유 칭호. 이번 생과 독립이라
   아직 한 생도 안 뽑았어도(session.currentLife 없이) 프로필이 있으면 공유된다.

   공유 시트(#shareModal) DOM은 결과 카드와 함께 쓰되, session.shareMode 로 흐름을 가른다:
   프로필로 열면 shareMode="profile" 이 되고, share.js 의 결과-카드 흐름은 스스로 빠진다.
   여기 붙는 .share-opt 리스너도 shareMode!=="profile" 이면 아무것도 안 한다.

   공유 URL 은 결과 카드(?ref=share)와 분리해 ?ref=share&type=profile 로 나간다 —
   프로필 공유가 결과 카드 공유보다 사람을 데려오는지 따로 집계하기 위해서다. */

/* 프로필 한 줄 요약(공유 문구·카카오 설명이 함께 쓴다) */
export function profileStatLines(){
 const dp=dexProgress(), best=rarestProb();
 const lines=[
  "🔁 "+t("환생 {n}번",{n:ST.total.toLocaleString()}),
  "📖 "+t("도감 {a}/{b} ({p}%)",{a:dp.owned,b:dp.total,p:dp.pct}),
 ];
 if(best!=null)lines.push("🎰 "+t("최고 희귀 기록 1/{n}",{n:Math.round(1/best).toLocaleString()}));
 lines.push("🏆 "+t("보유 칭호 {n}개",{n:earned().length}));
 return lines;
}
export function profileShareURL(via){
 let u=location.origin+location.pathname+"?ref=share&type=profile&v="+ST.ab;
 if(via)u+="&via="+via;
 return u;
}
export function profileText(via){
 const top=topTitle();
 const lines=[
  t("🌏 나의 환생 프로필"),
  ...(top?["🏅 "+tname(top)]:[]),
  "",
  ...profileStatLines(),
  "",
  t("나도 환생해 보기 👉 {url}",{url:profileShareURL(via)}),
 ];
 return lines.join("\n");
}

/* ── 프로필 카드 이미지 (1080x1350) ──
   결과 카드(share.js drawCard)와 같은 심연 배경·표면 그라데이션·서체를 써서 한 세트로 읽힌다.
   대표 칭호를 MBTI의 "4글자"처럼 위에 크게 박고, 통계 타일·도감 막대·대륙 진행·칭호 알약을 쌓는다. */
export function drawProfileCard(){
 const W=1080,H=1350,cv=document.createElement("canvas");cv.width=W;cv.height=H;
 const x=cv.getContext("2d");
 const SANS="'Malgun Gothic','Apple SD Gothic Neo','Yu Gothic','Meiryo',sans-serif";
 const SERIF="'Nanum Myeongjo','Noto Serif KR',Batang,'Malgun Gothic','Yu Mincho',serif";
 const INK="#ece9f5",MUTED="#9a98b5",GOLD="#f3c95c",SURFACE="#141a33",LINE="#2a3158";
 const sp=v=>{try{x.letterSpacing=v;}catch(e){}};

 /* 배경: 심연 그라데이션 + 별 (결과 카드와 동일) */
 const g=x.createLinearGradient(0,0,0,H);
 g.addColorStop(0,"#0a0d1c");g.addColorStop(.6,"#141a33");g.addColorStop(1,"#0a0d1c");
 x.fillStyle=g;x.fillRect(0,0,W,H);
 for(let i=0;i<160;i++){x.fillStyle="rgba(236,233,245,"+(Math.random()*.7+.1)+")";
  const r=Math.random()*1.8+.4;
  x.beginPath();x.arc(Math.random()*W,Math.random()*H,r,0,7);x.fill();}

 function fitFont(text,size,weight,fam,maxW,min){
  let s=size;x.font=(weight?weight+" ":"")+s+"px "+fam;
  while(s>min&&x.measureText(text).width>maxW){s--;x.font=(weight?weight+" ":"")+s+"px "+fam;}
  return s;
 }
 /* 진행 막대 하나 (도감·대륙 공용) */
 function bar(px,py,w,h,pct,color){
  x.fillStyle="rgba(236,233,245,.10)";roundRect(x,px,py,w,h,h/2);x.fill();
  const fw=Math.max(h,Math.round(w*Math.min(1,Math.max(0,pct/100))));
  x.fillStyle=color;roundRect(x,px,py,fw,h,h/2);x.fill();
 }

 /* ── 헤더 ── */
 x.textAlign="center";
 sp("8px");
 x.fillStyle=GOLD;x.font="600 34px "+SANS;
 x.fillText(t("환 생 시 뮬 레 이 터"),W/2,92);
 sp("0px");
 x.fillStyle=MUTED;x.font="26px "+SANS;
 x.fillText(t("나의 영혼 프로필"),W/2,136);

 /* ── 대표 칭호 (있으면 크게) ── */
 const top=topTitle();
 let cy=176;
 if(top){
  const label=top.icon+" "+tname(top);
  const fs=fitFont(label,44,"800",SERIF,W-200,28);
  const lw=x.measureText(label).width, pw=lw+56, ph=fs+34;
  roundRect(x,W/2-pw/2,cy,pw,ph,ph/2);
  x.fillStyle="rgba(243,201,92,.14)";x.fill();
  x.strokeStyle="rgba(243,201,92,.5)";x.lineWidth=2;x.stroke();
  x.fillStyle=GOLD;x.font="800 "+fs+"px "+SERIF;x.textBaseline="middle";
  x.fillText(label,W/2,cy+ph/2+2);x.textBaseline="alphabetic";
  cy+=ph+40;
 }else cy+=16;

 /* ── 통계 타일 3개 (사이트 .stats) ── */
 const dp=dexProgress(), best=rarestProb();
 const tiles=[
  {n:ST.total.toLocaleString(),           l:t("환생 횟수")},
  {n:dp.owned+"/"+dp.total,                l:t("나라 도감")},
  {n:best!=null?"1/"+Math.round(1/best).toLocaleString():"—", l:t("최고 희귀 기록")},
 ];
 const tG=20,tW=(W-108-tG*2)/3,tH=150,tX=54;
 tiles.forEach((d,i)=>{
  const px=tX+i*(tW+tG);
  x.fillStyle=SURFACE;roundRect(x,px,cy,tW,tH,16);x.fill();
  x.strokeStyle=LINE;x.lineWidth=2;roundRect(x,px,cy,tW,tH,16);x.stroke();
  x.fillStyle=GOLD;fitFont(d.n,40,"800",SANS,tW-28,20);
  x.fillText(d.n,px+tW/2,cy+70);
  x.fillStyle=MUTED;fitFont(d.l,20,"",SANS,tW-24,14);
  x.fillText(d.l,px+tW/2,cy+110);
 });
 cy+=tH+40;

 /* ── 도감 진행 막대 (전체 폭) ── */
 x.textAlign="left";
 x.fillStyle=INK;x.font="700 24px "+SANS;
 x.fillText("📖 "+t("나라 도감"),tX,cy);
 x.textAlign="right";
 x.fillStyle=MUTED;x.font="22px "+SANS;
 x.fillText(dp.owned+" / "+dp.total+" ("+dp.pct+"%)",W-54,cy);
 x.textAlign="left";
 bar(tX,cy+16,W-108,20,dp.pct,GOLD);
 cy+=64;

 /* ── 대륙별 정복 진행 ── */
 x.fillStyle=INK;x.font="700 24px "+SANS;
 x.fillText("👑 "+t("대륙 정복"),tX,cy+30);
 cy+=52;
 const cps=contProgress();
 const rowH=46;
 cps.forEach(c=>{
  x.textAlign="left";
  x.fillStyle=INK;x.font="600 21px "+SANS;
  x.fillText(contName(c.code),tX,cy+22);
  x.textAlign="right";
  x.fillStyle=c.owned>=c.total?GOLD:MUTED;x.font="20px "+SANS;
  x.fillText(c.owned+" / "+c.total,W-54,cy+22);
  x.textAlign="left";
  bar(tX,cy+30,W-108,12,c.pct,c.owned>=c.total?GOLD:"#b78ef0");
  cy+=rowH;
 });
 cy+=14;

 /* ── 보유 칭호 알약 (자랑 순 최대 8개) ── */
 const titles=earned().slice(0,8).map(a=>a.icon+" "+tname(a));
 if(titles.length){
  x.textAlign="left";
  x.fillStyle=INK;x.font="700 24px "+SANS;
  x.fillText("🏅 "+t("보유 칭호"),tX,cy+24);
  cy+=44;
  let bf=21;x.font="600 "+bf+"px "+SANS;
  const padX=16,gapB=10,hB=44,maxW=W-108;
  let px=tX,py=cy;
  titles.forEach(b=>{
   const w=x.measureText(b).width+padX*2;
   if(px+w>tX+maxW&&px>tX){px=tX;py+=hB+10;}
   x.fillStyle="rgba(243,201,92,.14)";roundRect(x,px,py,w,hB,hB/2);x.fill();
   x.strokeStyle="rgba(243,201,92,.4)";x.lineWidth=2;roundRect(x,px,py,w,hB,hB/2);x.stroke();
   x.fillStyle=GOLD;x.textBaseline="middle";x.fillText(b,px+padX,py+hB/2+1);x.textBaseline="alphabetic";
   px+=w+gapB;
  });
 }

 /* ── 푸터 (결과 카드와 동일) ── */
 x.textAlign="center";
 x.fillStyle=MUTED;
 fitFont(t("당신의 다음 생은 어디에서 시작될까요?"),26,"",SANS,W-120,18);
 x.fillText(t("당신의 다음 생은 어디에서 시작될까요?"),W/2,H-84);
 x.fillStyle=GOLD;x.font="26px "+SANS;
 x.fillText(location.host||t("환생 시뮬레이터"),W/2,H-42);
 return cv;
}
export function downloadProfileCard(){
 drawProfileCard().toBlob(b=>{
  if(!b)return;
  const a=document.createElement("a");
  a.href=URL.createObjectURL(b);
  a.download="rebirth-profile-"+ST.total+".png";
  a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),4000);
 },"image/png");
}
async function nativeProfileShare(txt){
 let payload={text:txt};
 try{
  const blob=await new Promise(res=>drawProfileCard().toBlob(res,"image/png"));
  if(blob){
   const file=new File([blob],"rebirth-profile.png",{type:"image/png"});
   if(navigator.canShare&&navigator.canShare({files:[file],text:txt}))payload={files:[file],text:txt};
  }
 }catch(e){}
 try{await navigator.share(payload);}catch(e){}
}
async function kakaoProfileShare(){
 if(!(await loadKakao()))return false;
 try{
  const url=profileShareURL("kakao");
  Kakao.Share.sendDefault({
   objectType:"feed",
   content:{
    title:t("🌏 나의 환생 프로필"),
    description:profileStatLines().join(" · "),
    imageUrl:document.querySelector('meta[property="og:image"]').content,
    link:{mobileWebUrl:url,webUrl:url},
   },
   buttons:[{title:t("나도 환생해 보기"),link:{mobileWebUrl:url,webUrl:url}}],
  });
  return true;
 }catch(e){return false;}
}

const IS_MOBILE=/Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

/* 프로필 공유 시트를 연다. 아직 한 생도 안 뽑았으면 프로필이 비어 있으니 먼저 유도한다. */
export function openProfileShare(){
 if(ST.total<=0){toast(t("먼저 환생 버튼을 눌러 프로필을 만들어 주세요"));return;}
 session.shareMode="profile";
 document.querySelector("#shareModal h3").textContent=t("📤 프로필 공유");
 $("shareModal").hidden=false;document.body.style.overflow="hidden";
 track("profile_share_open",{rolls:ST.total,owned:dexProgress().owned,titles:earned().length});
}

/* 공유 채널 처리 — shareMode 가 profile 일 때만 반응한다. share.js 의 결과-카드 흐름은
   같은 버튼에 붙어 있지만 shareMode!=="life" 면 스스로 빠지므로 둘이 겹치지 않는다. */
async function shareProfileVia(ch){
 if(session.shareMode!=="profile")return;
 closeShare();   /* 시트를 닫고 shareMode 를 다시 life 로 되돌린다(공유 값은 아래에서 다시 읽는다) */
 const txt=profileText(ch);
 const props={rolls:ST.total,owned:dexProgress().owned,titles:earned().length,via:ch};
 if(ch==="clip"){
  track("share_profile",props);
  toast(await copyText(txt)?t("공유 문구를 복사했어요 ✅"):t("복사에 실패했어요 😢"));
 }else if(ch==="kakao"){
  track("share_profile",props);
  if(!(await kakaoProfileShare())){
   if(IS_MOBILE&&navigator.share){
    toast(t("목록에서 카카오톡을 선택해 주세요 💬"));
    try{await navigator.share({text:txt});}catch(e){}
   }else{
    const ok=await copyText(txt);
    toast(ok?t("문구를 복사했어요. 카카오톡 채팅방에 붙여넣어 주세요 💬"):t("복사에 실패했어요 😢"));
   }
  }
 }else if(ch==="insta"){
  track("share_profile",props);
  downloadProfileCard();
  const copied=await copyText(txt);
  toast(copied?t("카드를 저장하고 문구도 복사했어요. 스토리에 붙여넣어 보세요 📸")
              :t("결과 카드를 저장했어요. 스토리에 올려 보세요 📸"));
  if(IS_MOBILE)setTimeout(()=>{location.href="instagram://story-camera";},900);
 }else if(ch==="x"){
  track("share_profile",props);
  open("https://x.com/intent/tweet?text="+encodeURIComponent(txt),"_blank","noopener");
 }else{
  track("share_profile",props);
  await nativeProfileShare(txt);
 }
}

$("achShare").addEventListener("click",openProfileShare);
$("dexShare").addEventListener("click",openProfileShare);
document.querySelectorAll(".share-opt").forEach(b=>b.addEventListener("click",()=>shareProfileVia(b.dataset.ch)));
