import {$,fmtPct,fmtUSD,isoCode,probPct} from "../core/util.js";
import {t,term,countryName,contName,bigNum} from "../i18n/i18n.js";
import {titleLine} from "./titlechip.js";
import {ST,session} from "../core/state.js";
import {flagOK,FLAG_FONT} from "./flags.js";
import {rarityColor} from "../engine/roll.js";
import {track} from "../analytics/track.js";
import {toast} from "./effects.js";
import {encodeLife} from "../engine/permalink.js";

/* ===== 공유 =====
   문구 A/B 테스트: 기기별로 스토리형(a)/성과형(b)이 고정 배정되고,
   공유 URL의 ?v= 파라미터로 어느 문구가 사람을 데려왔는지 추적한다.
   ?via= 는 어느 채널로 나간 링크인지다. 이게 없으면 카톡·X·기타 공유가 받는 쪽에서
   전부 ref=share 한 덩어리가 되어, 채널별 바이럴 계수를 못 낸다. */
/* 생을 서버에 등록하고 짧은 코드를 받는다. 실패하면(서버 다운·미서명 생) null.
   실제로 공유할 때 한 번만 부른다 — 리롤마다 부르면 안 쓸 코드까지 서버에 쌓인다. */
export async function registerShare(l){
 if(!l||!l.sig)return null;   /* 서버가 뽑아 서명한 생만 등록 가능 */
 try{
  const r=await fetch("/api/share",{method:"POST",cache:"no-store",
   headers:{"content-type":"application/json"},
   body:JSON.stringify({l:encodeLife(l),sig:l.sig})});
  if(!r.ok)return null;
  const d=await r.json();
  return typeof d.code==="string"?d.code:null;
 }catch(e){return null;}
}
/* code가 있으면 짧은 링크(?s=코드), 없으면 생 없는 링크(받는 쪽이 새로 뽑는다).
   생 값을 URL에 통째로 싣던 예전 방식(?l=&sig=)은 걷어냈다 — 링크만 보고 생이 읽히던 게
   지저분했다. 서버가 죽어 code를 못 받으면 문구로만 공유된다(예전의 미서명 폴백과 같다). */
export function shareURL(via,code){
 let u=location.origin+location.pathname+"?ref=share&v="+ST.ab;
 if(via)u+="&via="+via;
 if(code)u+="&s="+code;
 return u;
}
/* 12개 항목을 "이모지 라벨 값" 형태로 한 줄씩. 공유 문구와 결과 카드가 같은 목록을 쓴다 —
   한쪽에만 항목을 추가해 둘이 어긋나는 일을 막는다. 화면 칩(CHIP_DEFS)과 순서를 맞췄다. */
export function lifeStatLines(l){
 return [
  "🚻 "+t(l.male?"남자":"여자"),
  "🏙 "+t(l.urban?"도시":"농촌"),
  "🗣 "+term(l.c.lang),
  "🧬 "+term(l.eth[0]),
  "🙏 "+term(l.rel[0]),
  t("📏 키 {v}cm",{v:l.height}),
  t("⚖ 몸무게 {v}kg",{v:l.weight}),
  "🧠 IQ "+l.iq,
  t(l.lefty?"🫲 왼손잡이":"🫱 오른손잡이"),
  t(l.balding?"🧑‍🦲 탈모 예정":"💇 숱 유지"),
  t("⏳ 기대수명 {n}세",{n:l.lifeExp}),
  t("💰 연 {v}",{v:fmtUSD(l.income)}),
 ];
}
export function shareText(l,via,code){
 const flag=flagOK?l.c.flag+" ":"";
 const head=ST.ab==="a"
  ?t("🌏 나는 {flag}{country} {urban}에서 {gender}로 태어났다",
    {flag,country:countryName(l.c),urban:t(l.urban?"도시":"농촌"),gender:t(l.male?"남자":"여자")})
  :t("🎰 확률 {p}의 환생 뽑기 성공! {flag}{country}",{p:fmtPct(l.prob),flag,country:countryName(l.c)});
 const lines=[
  head,
  /* b(성과형)는 머리줄에서 이미 확률을 말했으므로 되풀이하지 않는다 */
  (ST.ab==="a"?t("이 생을 받을 확률 {p} · ",{p:fmtPct(l.prob)}):"")+t("나의 {n}번째 생",{n:ST.total.toLocaleString()}),
  /* 칭호 줄. 카드에 박힌 것과 같은 문구를 텍스트에도 실어 둘이 어긋나지 않게 한다 */
  ...(titleLine()?[titleLine()]:[]),
  "",
  ...lifeStatLines(l),   /* 12개 항목 전부 */
  "",
  t("나도 환생해 보기 👉 {url}",{url:shareURL(via,code)}),
 ];
 return lines.join("\n");
}
export async function copyText(t){
 try{await navigator.clipboard.writeText(t);return true;}
 catch(e){
  const ta=document.createElement("textarea");ta.value=t;document.body.appendChild(ta);
  ta.select();let ok=false;try{ok=document.execCommand("copy");}catch(e2){}
  ta.remove();return ok;
 }
}
/* ── 공유 시트 ──
   버튼 하나 → 채널 선택. 카카오는 JS 키가 있으면 톡공유 SDK를 쓰고, 없으면
   문구 복사 후 앱 열기로 대신한다(웹에서 키 없이 톡공유 창은 못 띄운다).
   인스타는 웹 공유 URL 자체가 없어서 카드 저장 + 스토리 카메라 열기가 최선이다. */
const IS_MOBILE=/Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
const KAKAO_JS_KEY="";/* developers.kakao.com JavaScript 키. 도메인 등록 후 채우면 카카오 버튼이 톡공유 창을 띄운다 */
let kakaoReady=null;
export function loadKakao(){
 if(!KAKAO_JS_KEY)return Promise.resolve(false);
 if(!kakaoReady)kakaoReady=new Promise(res=>{
  const s=document.createElement("script");
  s.src="https://t1.kakaocdn.net/kakao_js_sdk/2.7.4/kakao.min.js";
  s.onload=()=>{try{if(!Kakao.isInitialized())Kakao.init(KAKAO_JS_KEY);res(true);}catch(e){res(false);}};
  s.onerror=()=>res(false);
  document.head.appendChild(s);
 });
 return kakaoReady;
}
export async function kakaoShare(l,code){
 if(!(await loadKakao()))return false;
 try{
  const url=shareURL("kakao",code);
  Kakao.Share.sendDefault({
   objectType:"feed",
   content:{
    title:t("{flag}{country}에서 태어났습니다",{flag:flagOK?l.c.flag+" ":"",country:countryName(l.c)}),
    /* 카카오 카드 설명에도 12개 항목을 담는다. 카드는 줄바꿈을 접으므로 · 로 잇는다. */
    description:t("확률 {p} · 나의 {n}번째 생",{p:fmtPct(l.prob),n:ST.total.toLocaleString()})+"\n"
     +lifeStatLines(l).join(" · "),
    imageUrl:document.querySelector('meta[property="og:image"]').content,
    link:{mobileWebUrl:url,webUrl:url},
   },
   buttons:[{title:t("나도 환생해 보기"),link:{mobileWebUrl:url,webUrl:url}}],
  });
  return true;
 }catch(e){return false;}
}
export async function nativeShare(l,txt){
 let payload={text:txt};
 try{
  const blob=await new Promise(res=>drawCard(l).toBlob(res,"image/png"));
  if(blob){
   const file=new File([blob],"rebirth.png",{type:"image/png"});
   if(navigator.canShare&&navigator.canShare({files:[file],text:txt}))payload={files:[file],text:txt};
  }
 }catch(e){}
 try{await navigator.share(payload);}catch(e){}
}
export function openShare(){
 if(!session.currentLife)return;
 track("share_open",{country:session.currentLife.c.name,prob:probPct(session.currentLife.prob)});
 $("shareModal").hidden=false;document.body.style.overflow="hidden";
}
export function closeShare(){$("shareModal").hidden=true;document.body.style.overflow="";}
$("shareBtn").addEventListener("click",openShare);
$("shareClose").addEventListener("click",closeShare);
$("shareModal").addEventListener("click",e=>{if(e.target===$("shareModal"))closeShare();});
if(!navigator.share)$("shareOptNative").hidden=true;
export async function shareVia(ch){
 const l=session.currentLife;if(!l)return;
 closeShare();
 session.lifeShared=true;
 const props={country:l.c.name,prob:probPct(l.prob)};
 /* 생을 서버에 등록해 짧은 코드를 받는다(채널마다 한 번). 실패하면 code=null이라
    생 없는 링크로 나간다. 공유 시트를 이미 닫은 뒤라 이 await가 UI를 막지 않는다. */
 const code=await registerShare(l);
 const txt=shareText(l,ch,code);   /* 링크에 이 채널을 각인해서 내보낸다 */
 if(ch==="clip"){
  track("share_text",props);
  toast(await copyText(txt)?t("공유 문구를 복사했어요 ✅"):t("복사에 실패했어요 😢"));
 }else if(ch==="kakao"){
  track("share_kakao",props);
  if(!(await kakaoShare(l,code))){
   /* 키가 없으면 톡공유 창을 직접 못 연다. 모바일은 시스템 공유 시트에서
      카카오톡을 고르면 실제 채팅방 선택 화면으로 이어지므로 그쪽으로 보낸다.
      텍스트만 실어야 카톡이 링크 미리보기를 만들어 준다(파일을 실으면 링크가 죽는다). */
   if(IS_MOBILE&&navigator.share){
    toast(t("목록에서 카카오톡을 선택해 주세요 💬"));
    try{await navigator.share({text:txt});}catch(e){}
   }else{
    const ok=await copyText(txt);
    toast(ok?t("문구를 복사했어요. 카카오톡 채팅방에 붙여넣어 주세요 💬"):t("복사에 실패했어요 😢"));
   }
  }
 }else if(ch==="insta"){
  track("share_insta",props);
  downloadCard(l);
  /* 인스타는 텍스트 공유 API가 없다. 카드 이미지와 별개로 12개 항목 문구를 클립보드에
     넣어 두면, 스토리 스티커나 캡션에 바로 붙여넣을 수 있다. */
  const copied=await copyText(txt);
  toast(copied?t("카드를 저장하고 문구도 복사했어요. 스토리에 붙여넣어 보세요 📸")
              :t("결과 카드를 저장했어요. 스토리에 올려 보세요 📸"));
  if(IS_MOBILE)setTimeout(()=>{location.href="instagram://story-camera";},900);
 }else if(ch==="x"){
  track("share_x",props);
  open("https://x.com/intent/tweet?text="+encodeURIComponent(txt),"_blank","noopener");
 }else{
  track("share_native",props);
  await nativeShare(l,txt);
 }
}
document.querySelectorAll(".share-opt").forEach(b=>b.addEventListener("click",()=>shareVia(b.dataset.ch)));

/* 결과 카드 이미지 (1080x1350) */
export function drawCard(l){
 const W=1080,H=1350,cv=document.createElement("canvas");cv.width=W;cv.height=H;
 const x=cv.getContext("2d");
 const g=x.createLinearGradient(0,0,0,H);
 g.addColorStop(0,"#0a0d1c");g.addColorStop(.6,"#141a33");g.addColorStop(1,"#0a0d1c");
 x.fillStyle=g;x.fillRect(0,0,W,H);
 for(let i=0;i<160;i++){x.fillStyle="rgba(236,233,245,"+(Math.random()*.7+.1)+")";
  const r=Math.random()*1.8+.4;
  x.beginPath();x.arc(Math.random()*W,Math.random()*H,r,0,7);x.fill();}
 x.textAlign="center";
 /* 일본어 글리프는 Malgun Gothic에 없을 수 있어 Yu Gothic·Meiryo를 뒤에 받친다 */
 const SANS="'Malgun Gothic','Apple SD Gothic Neo','Yu Gothic','Meiryo',sans-serif";
 x.fillStyle="#f3c95c";x.font="600 34px "+SANS;
 x.fillText(t("환 생 시 뮬 레 이 터"),W/2,120);
 x.fillStyle="#9a98b5";x.font="30px "+SANS;
 x.fillText(t("나의 {n}번째 생",{n:ST.total.toLocaleString()}),W/2,175);
 /* 칭호 — 원래 목표였던 "자랑 공유"와 "도감작"이 만나는 지점이다.
    "삼사라 중독자 · 47개국 수집"이 카드에 박히면 수집 자체가 공유 동기가 된다.
    국기(240px)가 y≈290부터라 이 알약은 202~254 구간에 안전하게 들어간다. */
 const label=titleLine();
 if(label){
  x.font="600 32px "+SANS;
  const tw=x.measureText(label).width, ph=52;
  roundRect(x,W/2-tw/2-26,202,tw+52,ph,ph/2);
  x.fillStyle="rgba(243,201,92,.14)";x.fill();
  x.strokeStyle="rgba(243,201,92,.5)";x.lineWidth=2;x.stroke();
  x.fillStyle="#f3c95c";x.fillText(label,W/2,236);
 }
 if(flagOK){
  x.font="240px "+FLAG_FONT;
  x.fillText(l.c.flag,W/2,470);
 }else{
  x.strokeStyle="#f3c95c";x.lineWidth=8;
  x.beginPath();x.arc(W/2,380,130,0,7);x.stroke();
  x.fillStyle="#f3c95c";x.font="800 96px 'Segoe UI',sans-serif";
  x.fillText(isoCode(l.c.flag),W/2,415);
 }
 x.fillStyle="#ece9f5";x.font="800 88px Batang,'Malgun Gothic','Yu Mincho',serif";
 x.fillText(countryName(l.c),W/2,610);
 x.fillStyle="#9a98b5";x.font="36px "+SANS;
 x.fillText(contName(l.c.cont)+" · "+t(l.urban?"도시":"농촌")+" · "+t(l.male?"남자":"여자"),W/2,672);
 /* 등급 배지가 있던 자리. 이제 확률 자체가 희귀도를 말하므로 숫자를 크게 세운다. */
 x.fillStyle=rarityColor(l.c.pop);x.font="800 56px "+SANS;
 x.fillText(t("확률 {p}",{p:fmtPct(l.prob)}),W/2,762);
 x.fillStyle="#9a98b5";x.font="30px "+SANS;
 x.fillText(t("약 {n}번 중 1번",{n:bigNum(1/l.prob)}),W/2,810);
 /* 12개 항목을 2열 × 6줄로. 공유 문구와 같은 lifeStatLines()를 써서 둘이 어긋나지 않는다. */
 const stats=lifeStatLines(l);
 x.font="30px "+SANS;x.textAlign="left";
 const colX=[96,W/2+30], rowY0=880, rowGap=56;
 stats.forEach((line,i)=>{
  const col=i%2, row=(i-col)/2;
  x.fillStyle="#ece9f5";
  x.fillText(line,colX[col],rowY0+row*rowGap);
 });
 x.textAlign="center";
 x.fillStyle="#9a98b5";x.font="28px "+SANS;
 x.fillText(t("당신의 다음 생은 어디에서 시작될까요?"),W/2,H-116);
 x.fillStyle="#f3c95c";
 x.fillText(location.host||t("환생 시뮬레이터"),W/2,H-68);
 return cv;
}
export function roundRect(x,px,py,w,h,r){
 x.beginPath();x.moveTo(px+r,py);x.arcTo(px+w,py,px+w,py+h,r);
 x.arcTo(px+w,py+h,px,py+h,r);x.arcTo(px,py+h,px,py,r);x.arcTo(px,py,px+w,py,r);x.closePath();
}
export function downloadCard(l){
 drawCard(l).toBlob(b=>{
  if(!b)return;
  const a=document.createElement("a");
  a.href=URL.createObjectURL(b);
  a.download="rebirth-"+isoCode(l.c.flag)+"-"+ST.total+".png";
  a.click();
  setTimeout(()=>URL.revokeObjectURL(a.href),4000);
 },"image/png");
}
$("shareImg").addEventListener("click",()=>{
 if(!session.currentLife)return;
 session.lifeShared=true;
 track("share_card",{country:session.currentLife.c.name,prob:probPct(session.currentLife.prob)});
 downloadCard(session.currentLife);
});
