import {TOTAL} from "../core/data.js";
import {$,fmtPct,fmtUSD,isoCode,probPct} from "../core/util.js";
import {t,term,countryName,contName,bigNum} from "../i18n/i18n.js";
import {titleLine} from "./titlechip.js";
import {CHIP_DEFS,lifeBadges} from "./render.js";
import {ST,session} from "../core/state.js";
import {flagOK,FLAG_FONT} from "./flags.js";
import {rarityColor} from "../engine/roll.js";
import {track} from "../analytics/track.js";
import {toast} from "./effects.js";
import {encodeLife} from "../engine/permalink.js";
/* 운세는 같은 시트·같은 흐름을 쓰되, 결과 카드가 아니라 미끼형 운세 카드·문구로 나간다.
   isFortune으로 갈라 카드·문구·등록(결과별 OG 업로드)만 바꾼다 — 공유 시트 DOM은 그대로. */
import {isFortune,drawFortuneCard,downloadFortuneCard,fortuneTeaseText,registerFortuneShare} from "./fortunecard.js";

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
  l.cause.emoji+" "+t(l.cause.key),
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
  const cv=isFortune(l)?drawFortuneCard(l,"story"):drawCard(l);
  const blob=await new Promise(res=>cv.toBlob(res,"image/png"));
  if(blob){
   const file=new File([blob],"rebirth.png",{type:"image/png"});
   if(navigator.canShare&&navigator.canShare({files:[file],text:txt}))payload={files:[file],text:txt};
  }
 }catch(e){}
 try{await navigator.share(payload);}catch(e){}
}
export function openShare(){
 if(!session.currentLife)return;
 session.shareMode="life";
 document.querySelector("#shareModal h3").textContent=t("📤 공유하기");
 track("share_open",{country:session.currentLife.c.name,prob:probPct(session.currentLife.prob)});
 $("shareModal").hidden=false;document.body.style.overflow="hidden";
}
/* 시트를 닫으면 결과-카드 모드로 되돌린다 — 다음에 다시 열 때(대개 결과 공유) 기본이 생이라야 한다.
   프로필 공유(profile.js)도 이 시트를 쓰므로, 닫힘은 여기 한 곳에서 모드를 초기화한다. */
export function closeShare(){$("shareModal").hidden=true;document.body.style.overflow="";session.shareMode="life";}
$("shareBtn").addEventListener("click",openShare);
$("shareClose").addEventListener("click",closeShare);
$("shareModal").addEventListener("click",e=>{if(e.target===$("shareModal"))closeShare();});
if(!navigator.share)$("shareOptNative").hidden=true;
export async function shareVia(ch){
 /* 프로필 공유 모드면 이 흐름은 빠진다 — 같은 채널 버튼을 profile.js 가 처리한다. */
 if(session.shareMode!=="life")return;
 const l=session.currentLife;if(!l)return;
 closeShare();
 session.lifeShared=true;
 const fort=isFortune(l);   /* 운세면 미끼형 카드·문구·결과별 OG로 갈아탄다 */
 const props={country:l.c.name,prob:probPct(l.prob)};
 /* 생을 서버에 등록해 짧은 코드를 받는다(채널마다 한 번). 실패하면 code=null이라
    생 없는 링크로 나간다. 공유 시트를 이미 닫은 뒤라 이 await가 UI를 막지 않는다.
    운세는 결과별 OG 이미지까지 함께 올린다(registerFortuneShare) — 카톡·링크 미리보기가
    이 생의 운세 카드로 뜨게. 이미지가 무거워 첫 채널에서 한 번만 올리고 코드는 캐시된다. */
 const code=fort?await registerFortuneShare(l):await registerShare(l);
 const txt=fort?fortuneTeaseText(l,ch,code):shareText(l,ch,code);   /* 링크에 이 채널을 각인해서 내보낸다 */
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
  fort?downloadFortuneCard(l):downloadCard(l);
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

/* 결과 카드 이미지 (1080x1350) — 사이트 결과 화면을 그대로 재현한다("다시 환생하기"
   버튼만 없음): 히어로 패널(인구·국기·국가·서브라인·배지) + 칩 그리드.
   칩 내용은 화면과 같은 CHIP_DEFS, 배지는 lifeBadges를 그대로 써서 둘이 어긋나지 않는다. */
export function drawCard(l){
 const W=1080,H=1350,cv=document.createElement("canvas");cv.width=W;cv.height=H;
 const x=cv.getContext("2d");
 /* 일본어 글리프는 Malgun Gothic에 없을 수 있어 Yu Gothic·Meiryo를 뒤에 받친다 */
 const SANS="'Malgun Gothic','Apple SD Gothic Neo','Yu Gothic','Meiryo',sans-serif";
 const SERIF="'Nanum Myeongjo','Noto Serif KR',Batang,'Malgun Gothic','Yu Mincho',serif";
 const INK="#ece9f5",MUTED="#9a98b5",GOLD="#f3c95c",SURFACE="#141a33",LINE="#2a3158";
 const rarity=rarityColor(l.c.pop);
 const sp=v=>{try{x.letterSpacing=v;}catch(e){}};

 /* 배경: 심연 그라데이션 + 별 (사이트 body + #stars) */
 const g=x.createLinearGradient(0,0,0,H);
 g.addColorStop(0,"#0a0d1c");g.addColorStop(.6,"#141a33");g.addColorStop(1,"#0a0d1c");
 x.fillStyle=g;x.fillRect(0,0,W,H);
 for(let i=0;i<160;i++){x.fillStyle="rgba(236,233,245,"+(Math.random()*.7+.1)+")";
  const r=Math.random()*1.8+.4;
  x.beginPath();x.arc(Math.random()*W,Math.random()*H,r,0,7);x.fill();}

 /* 폭이 넘치면 글자를 줄여서 맞춘다 */
 function fitFont(text,size,weight,fam,maxW,min){
  let s=size;
  x.font=(weight?weight+" ":"")+s+"px "+fam;
  while(s>min&&x.measureText(text).width>maxW){s--;x.font=(weight?weight+" ":"")+s+"px "+fam;}
  return s;
 }
 /* 현재 폰트 기준, 글자 단위 줄바꿈(최대 n줄, 넘치면 말줄임) — CJK엔 단어 경계가 없다 */
 function wrapChars(text,maxW,n){
  const out=[];let line="";
  for(const ch of String(text)){
   if(x.measureText(line+ch).width>maxW&&line){
    if(out.length===n-1){ while(line&&x.measureText(line+"…").width>maxW)line=line.slice(0,-1);
     out.push(line+"…");return out; }
    out.push(line);line="";
   }
   line+=ch;
  }
  if(line)out.push(line);
  return out;
 }

 /* ── 헤더 (사이트 header: 제목 + lifeno) ── */
 x.textAlign="center";
 sp("8px");
 x.fillStyle=GOLD;x.font="600 34px "+SANS;
 x.fillText(t("환 생 시 뮬 레 이 터"),W/2,96);
 sp("0px");
 /* 칭호 + 생 번호를 한 줄에 — 사이트 헤더(.idrow)와 같은 구성이다.
    이 카드의 규칙이 "결과 화면을 그대로 재현"이므로 화면과 같은 줄에 둔다.
    히어로(hy=192)를 밀지 않으니 아래 높이 계산은 그대로 둬도 된다. */
 const lifeNo=t("당신의 {n}번째 생",{n:ST.total.toLocaleString()});
 const title=titleLine();
 if(title){
  x.font="600 24px "+SANS;
  const lw=x.measureText(title).width, pw=lw+28, ph=38, gap=12;
  x.font="26px "+SANS;
  const numW=x.measureText(lifeNo).width;
  const left=W/2-(pw+gap+numW)/2;
  roundRect(x,left,148-27,pw,ph,ph/2);
  x.fillStyle="rgba(243,201,92,.14)";x.fill();
  x.strokeStyle="rgba(243,201,92,.5)";x.lineWidth=2;x.stroke();
  x.textAlign="left";
  x.fillStyle=GOLD;x.font="600 24px "+SANS;
  x.fillText(title,left+14,148);
  x.font="26px "+SANS;
  x.fillText(lifeNo,left+pw+gap,148);
  x.textAlign="center";
 }else{
  x.font="26px "+SANS;
  x.fillText(lifeNo,W/2,148);
 }

 /* ── 히어로 패널 내용 계획 (높이를 먼저 계산해야 테두리를 그린다) ── */
 const badges=lifeBadges(l);
 const hx=54,hw=W-108,hy=192;
 let heroH=86+170+84+46+26;              /* popline+국기+국가+서브라인+아래 여백 */
 if(l.fortune)heroH+=44;
 if(badges.length)heroH+=64;

 /* 패널: 표면 그라데이션 + 희귀도 색 테두리·광채 (사이트 .hero) */
 const pg=x.createLinearGradient(0,hy,0,hy+heroH);
 pg.addColorStop(0,SURFACE);pg.addColorStop(1,"#10152b");
 x.fillStyle=pg;roundRect(x,hx,hy,hw,heroH,20);x.fill();
 x.save();
 x.shadowColor=rarity;x.shadowBlur=46;
 x.strokeStyle=rarity;x.lineWidth=3;
 roundRect(x,hx,hy,hw,heroH,20);x.stroke();
 x.restore();

 let cy=hy+60;
 /* popline: 인구 + 걸릴 확률 */
 const pop=t("{n}명",{n:l.c.pop>=1?bigNum(l.c.pop*1e6):Math.round(l.c.pop*1e6).toLocaleString()});
 const popline=t("인구 {p}",{p:pop})+" · "+t("걸릴 확률 {p}",{p:fmtPct(l.c.pop/TOTAL)});
 x.fillStyle=MUTED;
 fitFont(popline,26,"",SANS,hw-80,18);
 x.fillText(popline,W/2,cy);
 cy+=26;
 /* 국기 (미지원이면 사이트 .code-flag 스타일의 원형 ISO 배지) */
 if(flagOK){
  x.font="150px "+FLAG_FONT;
  x.fillText(l.c.flag,W/2,cy+140);
 }else{
  x.strokeStyle=GOLD;x.lineWidth=6;
  x.beginPath();x.arc(W/2,cy+85,80,0,7);x.stroke();
  x.fillStyle="#1c2445";x.beginPath();x.arc(W/2,cy+85,77,0,7);x.fill();
  x.fillStyle=GOLD;x.font="800 58px 'Segoe UI',sans-serif";
  x.fillText(isoCode(l.c.flag),W/2,cy+106);
 }
 cy+=170;
 /* 국가명 (serif) */
 const cname=countryName(l.c);
 x.fillStyle=INK;
 fitFont(cname,64,"800",SERIF,hw-80,34);
 x.fillText(cname,W/2,cy+58);
 cy+=84;
 /* 서브라인 */
 const sub=t("{cont} · {urban}에서 {gender}로 태어났습니다",
  {cont:contName(l.c.cont),urban:t(l.urban?"도시":"농촌"),gender:t(l.male?"남자":"여자")});
 x.fillStyle=MUTED;
 fitFont(sub,30,"",SANS,hw-80,20);
 x.fillText(sub,W/2,cy+30);
 cy+=46;
 /* 운세 (있을 때만 — 사이트 .fortune-line) */
 if(l.fortune){
  const fl="🔮 "+l.fortune;
  x.fillStyle="#b78ef0";
  fitFont(fl,26,"",SANS,hw-80,17);
  x.fillText(fl,W/2,cy+28);
  cy+=44;
 }
 /* 배지 (사이트 .badge 알약) */
 if(badges.length){
  let bf=21;
  x.font="600 "+bf+"px "+SANS;
  const padX=16,gapB=10,hB=42;
  let widths=badges.map(b=>x.measureText(b).width+padX*2);
  let total=widths.reduce((a,b)=>a+b,0)+gapB*(badges.length-1);
  while(total>hw-40&&bf>14){
   bf--;x.font="600 "+bf+"px "+SANS;
   widths=badges.map(b=>x.measureText(b).width+padX*2);
   total=widths.reduce((a,b)=>a+b,0)+gapB*(badges.length-1);
  }
  let bx=W/2-total/2;
  badges.forEach((b,i)=>{
   x.fillStyle="rgba(243,201,92,.14)";
   roundRect(x,bx,cy+8,widths[i],hB,21);x.fill();
   x.strokeStyle="rgba(243,201,92,.4)";x.lineWidth=2;
   roundRect(x,bx,cy+8,widths[i],hB,21);x.stroke();
   x.fillStyle=GOLD;x.textAlign="left";
   x.fillText(b,bx+padX,cy+8+28);
   bx+=widths[i]+gapB;
  });
  x.textAlign="center";
  cy+=64;
 }

 /* ── 칩 그리드 (사이트 .chips — 화면과 같은 CHIP_DEFS) ── */
 const defs=CHIP_DEFS.map(d=>{const r=d.f(l);return {k:t(d.k),v:String(r.v),s:String(r.s)};});
 const cols=3,gap=14,rows=Math.ceil(defs.length/cols);
 const cw=(hw-gap*(cols-1))/cols;
 const chY=hy+heroH+20,footH=118;
 let ch=Math.floor((H-chY-footH-(rows-1)*gap)/rows);
 ch=Math.max(112,Math.min(152,ch));
 const tall=ch>=128;   /* 히어로가 길면 칩이 낮아진다 — 안 배치를 압축한다 */
 x.textAlign="left";
 defs.forEach((d,i)=>{
  const col=i%cols,row=(i-col)/cols;
  const px=hx+col*(cw+gap),py=chY+row*(ch+gap);
  x.fillStyle=SURFACE;roundRect(x,px,py,cw,ch,14);x.fill();
  x.strokeStyle=LINE;x.lineWidth=2;roundRect(x,px,py,cw,ch,14);x.stroke();
  const pad=18,tx=px+pad,maxW=cw-pad*2;
  sp("2px");
  x.fillStyle=MUTED;
  fitFont(d.k,15,"600",SANS,maxW,11);
  x.fillText(d.k,tx,py+(tall?34:30));
  sp("0px");
  x.fillStyle=INK;
  fitFont(d.v,27,"700",SANS,maxW,17);
  x.fillText(d.v,tx,py+(tall?74:66));
  x.fillStyle=MUTED;
  if(tall){ /* 설명줄 최대 2줄 */
   x.font="16px "+SANS;
   wrapChars(d.s,maxW,2).forEach((ln,j)=>x.fillText(ln,tx,py+100+j*22));
  }else if(d.s){   /* 낮은 칩: 글자를 줄여서라도 한 줄에 최대한 다 넣는다. 설명줄이 빈 칩(사인)은 건너뛴다 */
   fitFont(d.s,16,"",SANS,maxW,12);
   x.fillText(wrapChars(d.s,maxW,1)[0],tx,py+94);
  }
 });

 /* ── 푸터 ── */
 x.textAlign="center";
 x.fillStyle=MUTED;
 fitFont(t("당신의 다음 생은 어디에서 시작될까요?"),26,"",SANS,W-120,18);
 x.fillText(t("당신의 다음 생은 어디에서 시작될까요?"),W/2,H-84);
 x.fillStyle=GOLD;x.font="26px "+SANS;
 x.fillText(location.host||t("환생 시뮬레이터"),W/2,H-42);
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
 const l=session.currentLife;if(!l)return;
 session.lifeShared=true;
 track("share_card",{country:l.c.name,prob:probPct(l.prob)});
 isFortune(l)?downloadFortuneCard(l):downloadCard(l);   /* 운세면 스토리 규격 운세 카드로 저장 */
});
