import {DATA,TOTAL} from "../core/data.js";
import {$,reduceMotion,fmtPct,fmtTop,fmtUSD} from "../core/util.js";
import {t,term,countryName,contName,bigNum} from "../i18n/i18n.js";
import {ST,seenSet,persist,session} from "../core/state.js";
import {startDwellClock} from "../analytics/track.js";
import {flagHTML} from "./flags.js";
import {rarityColor,iqTopPct} from "../engine/roll.js";
import {bumpGlobal} from "./counter.js";
import {burstConfetti} from "./effects.js";

export function updateStats(){
 $("stTotal").textContent=ST.total.toLocaleString();
 $("stSeen").textContent=seenSet.size+"/"+DATA.length;
 /* 최고 희귀 기록 = 태어나 본 나라(seenSet) 중 인구가 가장 적은 나라.
    도감이 나라별로 보여주는 "걸릴 확률"(c.pop/TOTAL)과 똑같은 척도로 계산해,
    같은 나라가 도감과 최고 기록에서 다른 %로 보이던 문제를 없앤다.
    seenSet에서 매번 뽑으므로 옛 저장본(생 전체 확률로 기록된 best)도 자동 교정된다.
    이름은 표시할 때만 현재 언어로 바꾼다. */
 let rarest=null;
 for(const i of seenSet){const c=DATA[i];if(c&&(!rarest||c.pop<rarest.pop))rarest=c;}
 $("stBest").textContent=rarest?countryName(rarest)+" "+fmtPct(rarest.pop/TOTAL):"·";
 /* 첫 화면 도감 티저의 카운트도 같은 값으로 맞춘다(태어나 본 나라 / 전체). */
 const dt=$("dexTeaseCount");if(dt)dt.textContent=seenSet.size+" / "+DATA.length;
}

/* 리롤 전 첫 화면 전용: 예시 결과 카드. 실제 데이터(아이슬란드)로 채워 "뽑으면
   이런 게 나온다"를 글 없이 보여준다. 첫 생을 그리면 renderLife가 이 카드를 숨긴다. */
export function showSample(){
 const c=DATA.find(x=>x.name==="아이슬란드")||DATA[0];
 const row=(k,v)=>'<div class="sc-row"><span class="sc-k">'+k+'</span><span class="sc-v">'+v+'</span></div>';
 const sc=$("sampleCard");
 sc.innerHTML=
  '<span class="sc-tag">'+t("예시 결과")+'</span>'+
  '<div class="sc-head"><span class="sc-country">'+c.flag+' '+countryName(c)+'</span>'+
  '<span class="sc-rare">'+t("상위 {p}",{p:fmtPct(c.pop/TOTAL)})+'</span></div>'+
  '<div class="sc-rows">'+
   row(t("성별")+' · '+t("키"),t("여성")+' · '+Math.round(c.hf)+'cm')+
   row(t("가구 소득"),t("상위 {p}",{p:"12%"}))+
   row(t("기대수명"),t("{n}세",{n:c.life}))+
  '</div>';
 sc.hidden=false;
}

/* ===== 렌더링 ===== */
export const CHIP_DEFS=[
 {k:"성별",f:l=>({v:t(l.male?"남자 ♂":"여자 ♀"),s:t("출생 성비 기준 {p}",{p:l.male?"51.2%":"48.8%"})})},
 {k:"태어난 곳",f:l=>({v:t(l.urban?"도시 🏙️":"농촌 🌾"),s:t("이 나라 도시화율 {p}%",{p:l.c.urban})})},
 {k:"모국어",f:l=>({v:term(l.c.lang),s:t("국가 대표 언어")})},
 {k:"민족",f:l=>({v:term(l.eth[0]),s:t("국가 내 약 {p}%",{p:l.eth[1]})})},
 {k:"종교",f:l=>({v:term(l.rel[0]),s:t("국가 내 약 {p}%",{p:l.rel[1]})})},
 {k:"키",f:l=>({v:l.height+"cm",s:t("이 나라 {g} 평균 {v}cm",{g:t(l.male?"남성":"여성"),v:l.male?l.c.hm:l.c.hf})})},
 {k:"몸무게",f:l=>({v:l.weight+"kg",s:t("BMI {b} · 국가 평균 {a}",{b:l.bmi.toFixed(1),a:l.c.bmi})})},
 {k:"IQ",f:l=>({v:l.iq,s:t("평균 100인 세계 공통 분포 · 상위 {t}",{t:fmtTop(iqTopPct(l.iq))})})},
 {k:"주로 쓰는 손",f:l=>({v:t(l.lefty?"왼손잡이 🫲":"오른손잡이 🫱"),s:l.lefty?"10%":"90%"})},
 {k:"탈모",f:l=>({v:t(l.balding?"탈모 예정 🧑‍🦲":"숱 유지 💇"),s:t("50세까지 {g} 약 {p}",{g:t(l.male?"남성":"여성"),p:l.male?"50%":"20%"})})},
 {k:"기대수명",f:l=>({v:t("{n}세",{n:l.lifeExp}),s:t("국가 평균 {n}세",{n:l.c.life})})},
 {k:"연 소득",f:l=>({v:fmtUSD(l.income),s:t("세계 상위 {t} · 1인당 GDP 기반 추정",{t:fmtTop(l.top)})})},
];
export function renderLife(l){
 session.currentLife=l;
 /* 리롤 전 첫 화면(intro-card)을 걷고, 결과·리롤 버튼·부가 컨트롤·통계를 드러낸다.
    hero 등은 기본 hidden(FOUC 방지)이라 여기서 반드시 켜 준다 — 리롤/공유 양쪽 다 이 경로를 탄다. */
 $("introCard").hidden=true;
 $("hero").hidden=false;$("controls").hidden=false;$("controlsAfter").hidden=false;$("stats").hidden=false;
 const hero=$("hero");
 hero.style.setProperty("--rarity-color",rarityColor(l.c.pop));
 $("popline").hidden=false;
 const pop=t("{n}명",{n:l.c.pop>=1?bigNum(l.c.pop*1e6):Math.round(l.c.pop*1e6).toLocaleString()});
 /* 나라가 걸릴 확률은 곧 인구 비중이라 인구 옆에 붙여야 "인구가 확률"이 한눈에 읽힌다.
    나라의 고정 속성이라 성별·도시까지 곱한 생 전체 확률과 달리 줄 수가 늘 일정하다 —
    그래서 이걸 넣어도 아래 "다시 환생하기" 버튼이 밀리지 않는다. */
 $("popline").innerHTML=t("인구 {p}",{p:pop})+' <span class="pop-prob">· '+t("걸릴 확률 {p}",{p:fmtPct(l.c.pop/TOTAL)})+"</span>";
 $("flag").innerHTML=flagHTML(l.c);
 $("country").textContent=countryName(l.c);
 $("subline").textContent=t("{cont} · {urban}에서 {gender}로 태어났습니다",
  {cont:contName(l.c.cont),urban:t(l.urban?"도시":"농촌"),gender:t(l.male?"남자":"여자")});
 const badges=[];
 if(l.c.pop<0.5)badges.push(t("🌟 인구 50만 미만의 나라"));
 else if(l.c.pop<5)badges.push(t("✨ 인구 500만 미만의 나라"));
 if(l.lefty)badges.push(t("🫲 왼손잡이"));
 if(l.lifeExp>=100)badges.push(t("💯 100세 장수 예정"));
 if(l.top<=1)badges.push(t("💎 소득 상위 1%"));
 $("badges").innerHTML=badges.map(b=>'<span class="badge">'+b+"</span>").join("");
 const chips=$("chips");chips.hidden=false;
 chips.innerHTML=CHIP_DEFS.map((d,i)=>{const r=d.f(l);
  return '<div class="chip" style="transition-delay:'+(reduceMotion?0:i*60)+'ms"><div class="k">'+t(d.k)+
   '</div><div class="v">'+r.v+'</div><div class="s">'+r.s+"</div></div>";}).join("");
 requestAnimationFrame(()=>requestAnimationFrame(()=>{
  chips.querySelectorAll(".chip").forEach(el=>el.classList.add("reveal"));}));
 $("lifeNo").textContent=t("당신의 {n}번째 생",{n:ST.total.toLocaleString()});
 $("rollBtn").textContent=t("🔄 다시 환생하기");
 $("shareRow").hidden=false;
 const fl=$("fortuneLine");
 if(l.fortune){fl.hidden=false;fl.textContent="🔮 "+l.fortune;}
 else fl.hidden=true;
 /* 이 생을 보기 시작한 시각부터 dwell 시계가 돈다. lifeShownAt·마지막 상호작용 시각을
    함께 찍고, 자리를 비우면 dwell을 닫을 idle 타이머를 건다(track.js). */
 startDwellClock();
 if(l.c.pop<5)burstConfetti(rarityColor(l.c.pop));
}
export function recordLife(l){
 ST.total++;seenSet.add(l.ci);
 /* 최고 희귀 기록은 seenSet에서 updateStats가 직접 계산한다(도감과 같은 척도).
    여기서 따로 ST.best를 관리하지 않는다 — 두 값이 어긋나던 원인이었다. */
 persist();updateStats();bumpGlobal();
}
