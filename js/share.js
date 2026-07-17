import {CONT_NAME} from "./data.js";
import {$,fmtPct,fmtTop,fmtUSD,koNum,isoCode,probPct} from "./util.js";
import {ST,session} from "./state.js";
import {flagOK,FLAG_FONT} from "./flags.js";
import {rarityColor} from "./roll.js";
import {track} from "./track.js";
import {toast} from "./effects.js";
import {encodeLife} from "./permalink.js";

/* ===== 공유 =====
   문구 A/B 테스트: 기기별로 스토리형(a)/성과형(b)이 고정 배정되고,
   공유 URL의 ?v= 파라미터로 어느 문구가 사람을 데려왔는지 추적한다.
   ?via= 는 어느 채널로 나간 링크인지다. 이게 없으면 카톡·X·기타 공유가 받는 쪽에서
   전부 ref=share 한 덩어리가 되어, 채널별 바이럴 계수를 못 낸다. */
export function shareURL(via,l){
 let u=location.origin+location.pathname+"?ref=share&v="+ST.ab;
 if(via)u+="&via="+via;
 /* 받는 사람이 내가 뽑은 생을 그대로 보게 링크에 싣는다. 없으면 링크를 눌러도
    자기 생이 새로 뽑혀서 "무슨 생을 받았는지"가 텍스트에만 남는다.
    sig는 서버가 이 생을 실제로 뽑았다는 증거다. 없는 생(서버가 죽어 로컬에서 뽑은 것)은
    l= 자체를 싣지 않는다 — 보증 못 하는 값을 실어 봐야 받는 쪽에서 위조로 걸릴 뿐이고,
    그러느니 예전처럼 문구로만 전하는 게 낫다. */
 if(l&&l.sig)u+="&l="+encodeLife(l)+"&sig="+l.sig;
 return u;
}
export function shareText(l,via){
 const flag=flagOK?l.c.flag+" ":"";
 const head=ST.ab==="a"
  ?"🌏 나는 "+flag+l.c.name+" "+(l.urban?"도시":"농촌")+"에서 "+(l.male?"남자":"여자")+"로 태어났다"
  :"🎰 확률 "+fmtPct(l.prob)+"의 환생 뽑기 성공! "+flag+l.c.name;
 const lines=[
  head,
  /* b(성과형)는 머리줄에서 이미 확률을 말했으므로 되풀이하지 않는다 */
  (ST.ab==="a"?"이 생을 받을 확률 "+fmtPct(l.prob)+" · ":"")+"나의 "+ST.total.toLocaleString()+"번째 생",
  "🗣 "+l.c.lang+" · 🙏 "+l.rel[0]+" · ⏳ 기대수명 "+l.lifeExp+"세 · 💰 연 "+fmtUSD(l.income),
 ];
 const badges=[];
 if(l.lefty)badges.push("🫲 왼손잡이");
 if(l.top<=1)badges.push("💎 소득 상위 1%");
 if(badges.length)lines.push(badges.join(" · "));
 lines.push("나도 환생해 보기 👉 "+shareURL(via,l));
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
export async function kakaoShare(l){
 if(!(await loadKakao()))return false;
 try{
  const url=shareURL("kakao",l);
  Kakao.Share.sendDefault({
   objectType:"feed",
   content:{
    title:(flagOK?l.c.flag+" ":"")+l.c.name+"에서 태어났습니다",
    description:"확률 "+fmtPct(l.prob)+" · 나의 "+ST.total.toLocaleString()+"번째 생",
    imageUrl:document.querySelector('meta[property="og:image"]').content,
    link:{mobileWebUrl:url,webUrl:url},
   },
   buttons:[{title:"나도 환생해 보기",link:{mobileWebUrl:url,webUrl:url}}],
  });
  return true;
 }catch(e){return false;}
}
export async function nativeShare(l,t){
 let payload={text:t};
 try{
  const blob=await new Promise(res=>drawCard(l).toBlob(res,"image/png"));
  if(blob){
   const file=new File([blob],"rebirth.png",{type:"image/png"});
   if(navigator.canShare&&navigator.canShare({files:[file],text:t}))payload={files:[file],text:t};
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
 const t=shareText(l,ch);   /* 링크에 이 채널을 각인해서 내보낸다 */
 if(ch==="clip"){
  track("share_text",props);
  toast(await copyText(t)?"공유 문구를 복사했어요 ✅":"복사에 실패했어요 😢");
 }else if(ch==="kakao"){
  track("share_kakao",props);
  if(!(await kakaoShare(l))){
   const ok=await copyText(t);
   toast(ok?"문구를 복사했어요. 카카오톡 채팅방에 붙여넣어 주세요 💬":"복사에 실패했어요 😢");
   if(ok&&IS_MOBILE)setTimeout(()=>{location.href="kakaotalk://launch";},700);
  }
 }else if(ch==="insta"){
  track("share_insta",props);
  downloadCard(l);
  toast("결과 카드를 저장했어요. 스토리에 올려 보세요 📸");
  if(IS_MOBILE)setTimeout(()=>{location.href="instagram://story-camera";},900);
 }else if(ch==="x"){
  track("share_x",props);
  open("https://x.com/intent/tweet?text="+encodeURIComponent(t),"_blank","noopener");
 }else{
  track("share_native",props);
  await nativeShare(l,t);
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
 x.fillStyle="#f3c95c";x.font="600 34px 'Malgun Gothic','Apple SD Gothic Neo',sans-serif";
 x.fillText("환 생 시 뮬 레 이 터",W/2,120);
 x.fillStyle="#9a98b5";x.font="30px 'Malgun Gothic',sans-serif";
 x.fillText("나의 "+ST.total.toLocaleString()+"번째 생",W/2,175);
 if(flagOK){
  x.font="240px "+FLAG_FONT;
  x.fillText(l.c.flag,W/2,470);
 }else{
  x.strokeStyle="#f3c95c";x.lineWidth=8;
  x.beginPath();x.arc(W/2,380,130,0,7);x.stroke();
  x.fillStyle="#f3c95c";x.font="800 96px 'Segoe UI',sans-serif";
  x.fillText(isoCode(l.c.flag),W/2,415);
 }
 x.fillStyle="#ece9f5";x.font="800 88px Batang,'Malgun Gothic',serif";
 x.fillText(l.c.name,W/2,610);
 x.fillStyle="#9a98b5";x.font="36px 'Malgun Gothic',sans-serif";
 x.fillText(CONT_NAME[l.c.cont]+" · "+(l.urban?"도시":"농촌")+" · "+(l.male?"남자":"여자"),W/2,672);
 /* 등급 배지가 있던 자리. 이제 확률 자체가 희귀도를 말하므로 숫자를 크게 세운다. */
 x.fillStyle=rarityColor(l.c.pop);x.font="800 56px 'Malgun Gothic',sans-serif";
 x.fillText("확률 "+fmtPct(l.prob),W/2,762);
 x.fillStyle="#9a98b5";x.font="30px 'Malgun Gothic',sans-serif";
 x.fillText("약 "+koNum(1/l.prob)+"번 중 1번",W/2,810);
 x.fillStyle="#ece9f5";x.font="34px 'Malgun Gothic',sans-serif";
 const rows=[
  "🗣 "+l.c.lang+"    🙏 "+l.rel[0],
  "⏳ 기대수명 "+l.lifeExp+"세    💰 연 "+fmtUSD(l.income),
  "🌍 세계 소득 상위 "+fmtTop(l.top),
 ];
 const extra=[];
 if(l.lefty)extra.push("🫲 왼손잡이");
 if(extra.length)rows.push(extra.join("    "));
 rows.forEach((r,i)=>x.fillText(r,W/2,900+i*64));
 x.fillStyle="#9a98b5";x.font="28px 'Malgun Gothic',sans-serif";
 x.fillText("당신의 다음 생은 어디에서 시작될까요?",W/2,H-120);
 x.fillStyle="#f3c95c";
 x.fillText(location.host||"환생 시뮬레이터",W/2,H-70);
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
