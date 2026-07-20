import {DATA,TOTAL} from "../core/data.js";
import {ST,seenSet} from "../core/state.js";

/* ===== 칭호 · 마일스톤 =====
   198개국 도감을 다 채우는 건 확률상 사실상 불가능하다(모나코 하나가 20만분의 1이라
   기대 환생 횟수가 수십만 회). 최종 목표 하나만 두면 "어차피 못 한다"가 되어 오히려
   이탈한다. 그래서 중간 목표를 잘게 쪼개 늘 다음 한 칸이 보이게 한다.

   이 모듈은 순수 로직이다 — DOM도 i18n도 모른다(README의 의존 방향: core → engine → ui).
   문구는 {ko,en} 두 벌로 들고 있고, 어느 쪽을 쓸지는 UI가 정한다.
   ⚠ 실험 단계라 ko/en만 있다. 채택하면 ja/zh/es/pt 4벌을 채워야 한다. */

const ROLL=[
 /* 1회짜리를 둔 건 인심이 아니라 발견성 때문이다 — 첫 칭호가 10회에나 붙으면
    대부분은 칭호 체계가 있다는 것조차 모르고 떠난다. */
 {n:1,    ko:"첫 생",        en:"First Life"},
 {n:10,   ko:"윤회 입문자",   en:"Samsara Novice"},
 {n:50,   ko:"환생 단골",     en:"Frequent Reincarnator"},
 {n:100,  ko:"삼사라 중독자", en:"Samsara Addict"},
 {n:500,  ko:"윤회의 달인",   en:"Wheel Master"},
 {n:1000, ko:"천 번의 생",    en:"Thousand Lives"},
 {n:5000, ko:"초월자",       en:"The Transcendent"},
];
const DEX=[
 {n:10,  ko:"첫 수집가",       en:"First Collector"},
 {n:30,  ko:"지구 여행자",     en:"World Traveler"},
 {n:60,  ko:"대륙 순례자",     en:"Continental Pilgrim"},
 {n:100, ko:"백 개국의 영혼",  en:"Soul of a Hundred Nations"},
 {n:150, ko:"지도 정복자",     en:"Map Conqueror"},
 {n:198, ko:"완전한 도감",     en:"The Complete Dex"},
];
/* 최고 희귀 기록(가장 작은 확률)으로 주는 칭호 */
const RARE=[
 {p:1/10000,  ko:"로또 영혼",      en:"Lottery Soul"},
 {p:1/50000,  ko:"기적의 확률",    en:"Miracle Odds"},
 {p:1/200000, ko:"우주가 봐준 생", en:"Cosmic Fluke"},
];
const CONT_KO={AS:"아시아",EU:"유럽",AF:"아프리카",NA:"북아메리카",SA:"남아메리카",OC:"오세아니아"};
const CONT_EN={AS:"Asia",EU:"Europe",AF:"Africa",NA:"North America",SA:"South America",OC:"Oceania"};

/* 대륙별 전체 국가 수는 데이터에서 센다 — data.js가 바뀌어도 따라간다 */
const CONT_TOTAL={};
for(const c of DATA)CONT_TOTAL[c.cont]=(CONT_TOTAL[c.cont]||0)+1;
export const CONT_CODES=Object.keys(CONT_TOTAL);

/* 대륙별로 몇 개국을 태어나 봤나 */
export function contProgress(){
 const owned={};
 for(const i of seenSet){const c=DATA[i];if(c)owned[c.cont]=(owned[c.cont]||0)+1;}
 return CONT_CODES.map(code=>({
  code, ko:CONT_KO[code], en:CONT_EN[code],
  owned:owned[code]||0, total:CONT_TOTAL[code],
  pct:Math.round((owned[code]||0)/CONT_TOTAL[code]*100),
 })).sort((a,b)=>b.pct-a.pct);
}

export function dexProgress(){
 const owned=seenSet.size, total=DATA.length;
 return {owned,total,pct:Math.round(owned/total*100)};
}

/* 최고 희귀 기록 = 태어나 본 나라 중 인구가 가장 적은 나라의 확률.
   ⚠ ST.best 를 쓰면 안 된다 — 도감과 값이 어긋나서 폐기된 필드라 갱신되지 않는다.
   updateStats()와 똑같이 seenSet에서 매번 계산해야 두 화면이 같은 숫자를 말한다. */
export function rarestProb(){
 let r=null;
 for(const i of seenSet){const c=DATA[i];if(c&&(!r||c.pop<r.pop))r=c;}
 return r?r.pop/TOTAL:null;
}

/* 획득한 칭호 전부. w(무게)가 클수록 자랑할 만한 것 — 대표 칭호를 고르는 기준이다.
   무게 순서: 누적 횟수 < 희귀도 < 대륙 탐험 < 도감 < 대륙 정복.
   ⚠ 희귀도를 일부러 낮게 뒀다. 나라를 많이 모으면 작은 나라가 저절로 딸려 와서
   수집가에겐 자동으로 붙는다 — 위에 두면 도감 47개국이든 190개국이든 대표 칭호가
   똑같이 "우주가 봐준 생"으로 고정돼 성장이 안 보인다. 희귀도는 초반 운을 기념하는 자리다. */
export function earned(){
 const out=[];
 const best=rarestProb();

 ROLL.forEach((x,i)=>{ if(ST.total>=x.n)
  out.push({id:"roll"+x.n,icon:"🔁",ko:x.ko,en:x.en,w:10+i}); });

 DEX.forEach((x,i)=>{ if(seenSet.size>=x.n)
  out.push({id:"dex"+x.n,icon:"📖",ko:x.ko,en:x.en,w:30+i}); });

 for(const c of contProgress()){
  if(c.owned>=c.total)
   out.push({id:"conq"+c.code,icon:"👑",ko:c.ko+" 정복자",en:"Conqueror of "+c.en,
    /* 큰 대륙일수록 어렵다 — 아시아(50) 정복이 남아메리카(12)보다 위 */
    w:40+c.total/10});
  else if(c.owned*2>=c.total)
   out.push({id:"exp"+c.code,icon:"🧭",ko:c.ko+" 탐험가",en:c.en+" Explorer",w:25+c.total/50});
 }

 if(best!==null)RARE.forEach((x,i)=>{ if(best<=x.p)
  out.push({id:"rare"+i,icon:"🎰",ko:x.ko,en:x.en,w:20+i}); });

 return out.sort((a,b)=>b.w-a.w);
}

/* 첫 화면·공유 카드에 박히는 대표 칭호 (없으면 null) */
export function topTitle(){ return earned()[0]||null; }

/* 다음 목표 하나. "어차피 못 한다"를 막는 장치라 항상 가장 가까운 것을 준다.
   {ko,en,now,goal} — UI가 "앞으로 N번" 같은 문구를 만든다. */
export function nextGoal(){
 const cands=[];
 const r=ROLL.find(x=>ST.total<x.n);
 if(r)cands.push({ko:r.ko,en:r.en,icon:"🔁",now:ST.total,goal:r.n});
 const d=DEX.find(x=>seenSet.size<x.n);
 if(d)cands.push({ko:d.ko,en:d.en,icon:"📖",now:seenSet.size,goal:d.n});
 for(const c of contProgress()){
  if(c.owned<c.total&&c.owned*2>=c.total)
   cands.push({ko:c.ko+" 정복자",en:"Conqueror of "+c.en,icon:"👑",now:c.owned,goal:c.total});
 }
 /* 남은 양이 가장 적은 것 = 손에 가장 가까운 목표 */
 return cands.sort((a,b)=>(a.goal-a.now)-(b.goal-b.now))[0]||null;
}
