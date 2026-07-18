import {DATA,TOTAL,CONT_NAME} from "./data.js";
import {$,reduceMotion,koNum,fmtPct,fmtTop,fmtUSD} from "./util.js";
import {ST,seenSet,persist,session} from "./state.js";
import {flagHTML} from "./flags.js";
import {rarityColor,iqTopPct} from "./roll.js";
import {bumpGlobal} from "./counter.js";
import {burstConfetti} from "./effects.js";

export function updateStats(){
 $("stTotal").textContent=ST.total.toLocaleString();
 $("stSeen").textContent=seenSet.size+"/"+DATA.length;
 /* 최고 희귀 기록 = 태어나 본 나라(seenSet) 중 인구가 가장 적은 나라.
    도감이 나라별로 보여주는 "걸릴 확률"(c.pop/TOTAL)과 똑같은 척도로 계산해,
    같은 나라가 도감과 최고 기록에서 다른 %로 보이던 문제를 없앤다.
    seenSet에서 매번 뽑으므로 옛 저장본(생 전체 확률로 기록된 best)도 자동 교정된다. */
 let rarest=null;
 for(const i of seenSet){const c=DATA[i];if(c&&(!rarest||c.pop<rarest.pop))rarest=c;}
 $("stBest").textContent=rarest?rarest.name+" "+fmtPct(rarest.pop/TOTAL):"·";
}

/* ===== 렌더링 ===== */
export const CHIP_DEFS=[
 {k:"성별",f:l=>({v:l.male?"남자 ♂":"여자 ♀",s:"출생 성비 기준 "+(l.male?"51.2%":"48.8%")})},
 {k:"태어난 곳",f:l=>({v:l.urban?"도시 🏙️":"농촌 🌾",s:"이 나라 도시화율 "+l.c.urban+"%"})},
 {k:"모국어",f:l=>({v:l.c.lang,s:"국가 대표 언어"})},
 {k:"민족",f:l=>({v:l.eth[0],s:"국가 내 약 "+l.eth[1]+"%"})},
 {k:"종교",f:l=>({v:l.rel[0],s:"국가 내 약 "+l.rel[1]+"%"})},
 {k:"키",f:l=>({v:l.height+"cm",s:"이 나라 "+(l.male?"남성":"여성")+" 평균 "+(l.male?l.c.hm:l.c.hf)+"cm"})},
 {k:"몸무게",f:l=>({v:l.weight+"kg",s:"BMI "+l.bmi.toFixed(1)+" · 국가 평균 "+l.c.bmi})},
 {k:"IQ",f:l=>({v:l.iq,s:"평균 100인 세계 공통 분포 · 상위 "+fmtTop(iqTopPct(l.iq))})},
 {k:"주로 쓰는 손",f:l=>({v:l.lefty?"왼손잡이 🫲":"오른손잡이 🫱",s:l.lefty?"10%":"90%"})},
 {k:"탈모",f:l=>({v:l.balding?"탈모 예정 🧑‍🦲":"숱 유지 💇",s:"50세까지 "+(l.male?"남성 약 50%":"여성 약 20%")})},
 {k:"기대수명",f:l=>({v:l.lifeExp+"세",s:"국가 평균 "+l.c.life+"세"})},
 {k:"연 소득",f:l=>({v:fmtUSD(l.income),s:"세계 상위 "+fmtTop(l.top)+" · 1인당 GDP 기반 추정"})},
];
export function renderLife(l){
 session.currentLife=l;
 const hero=$("hero");
 hero.style.setProperty("--rarity-color",rarityColor(l.c.pop));
 $("popline").hidden=false;
 const pop=l.c.pop>=1?koNum(l.c.pop*1e6)+"명":Math.round(l.c.pop*1e6).toLocaleString()+"명";
 /* 나라가 걸릴 확률은 곧 인구 비중이라 인구 옆에 붙여야 "인구가 확률"이 한눈에 읽힌다.
    나라의 고정 속성이라 성별·도시까지 곱한 생 전체 확률과 달리 줄 수가 늘 일정하다 —
    그래서 이걸 넣어도 아래 "다시 환생하기" 버튼이 밀리지 않는다. */
 $("popline").innerHTML="인구 "+pop+' <span class="pop-prob">· 걸릴 확률 '+fmtPct(l.c.pop/TOTAL)+"</span>";
 $("flag").innerHTML=flagHTML(l.c);
 $("country").textContent=l.c.name;
 $("subline").textContent=CONT_NAME[l.c.cont]+" · "+(l.urban?"도시":"농촌")+"에서 "+(l.male?"남자":"여자")+"로 태어났습니다";
 const badges=[];
 if(l.c.pop<0.5)badges.push("🌟 인구 50만 미만의 나라");
 else if(l.c.pop<5)badges.push("✨ 인구 500만 미만의 나라");
 if(l.lefty)badges.push("🫲 왼손잡이");
 if(l.lifeExp>=100)badges.push("💯 100세 장수 예정");
 if(l.top<=1)badges.push("💎 소득 상위 1%");
 $("badges").innerHTML=badges.map(b=>'<span class="badge">'+b+"</span>").join("");
 const chips=$("chips");chips.hidden=false;
 chips.innerHTML=CHIP_DEFS.map((d,i)=>{const r=d.f(l);
  return '<div class="chip" style="transition-delay:'+(reduceMotion?0:i*60)+'ms"><div class="k">'+d.k+
   '</div><div class="v">'+r.v+'</div><div class="s">'+r.s+"</div></div>";}).join("");
 requestAnimationFrame(()=>requestAnimationFrame(()=>{
  chips.querySelectorAll(".chip").forEach(el=>el.classList.add("reveal"));}));
 $("lifeNo").textContent="당신의 "+ST.total.toLocaleString()+"번째 생";
 $("rollBtn").textContent="🔄 다시 환생하기";
 $("shareRow").hidden=false;
 const fl=$("fortuneLine");
 if(l.fortune){fl.hidden=false;fl.textContent="🔮 "+l.fortune;}
 else fl.hidden=true;
 /* 이 생을 보기 시작한 시각. 여기서부터 다음 리롤까지가 "이번 생 어때요?"의 답이다. */
 session.lifeShownAt=performance.now();session.dwellSent=false;session.lifeShared=false;
 if(l.c.pop<5)burstConfetti(rarityColor(l.c.pop));
}
export function recordLife(l){
 ST.total++;seenSet.add(l.ci);
 /* 최고 희귀 기록은 seenSet에서 updateStats가 직접 계산한다(도감과 같은 척도).
    여기서 따로 ST.best를 관리하지 않는다 — 두 값이 어긋나던 원인이었다. */
 persist();updateStats();bumpGlobal();
}
