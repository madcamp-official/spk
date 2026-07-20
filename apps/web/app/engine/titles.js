import {DATA,TOTAL,REL} from "../../core/data.js";
import {ST,seenSet,relSet,ethSet} from "../core/state.js";

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
/* ── 기록형 업적 — "가장 ~했던 생"을 기억한다 ──
   나라 도감이 "무엇을 모았나"라면 이쪽은 "어디까지 극단을 봤나"다. 이미 뽑고 있는 지표라
   새 데이터가 필요 없다. 값은 ST.rec 에 누적된다(state.js).
   ⚠ 문턱은 반드시 roll.js가 실제로 만들 수 있는 범위 안이어야 한다. 안 그러면 영영 못 따는
   낚시 업적이 된다: IQ는 clamp(...,50,150)이라 150이 상한, 키는 130~215, BMI는 13.5~48.
   up:1 = 클수록 좋음, up:0 = 작을수록 좋음(소득 상위 %, 최단신 등). */
const REC=[
 {k:"iq",  v:130, up:1, icon:"🧠", ko:"수재의 생",      en:"Gifted Mind",    w:22},
 {k:"iq",  v:140, up:1, icon:"🧠", ko:"천재의 생",      en:"Genius Mind",    w:23},
 {k:"iq",  v:150, up:1, icon:"🧠", ko:"IQ 상한의 생",   en:"Peak Intellect", w:25},
 {k:"hMax",v:190, up:1, icon:"📏", ko:"장신의 생",      en:"Towering",       w:22},
 {k:"hMax",v:200, up:1, icon:"📏", ko:"거인의 생",      en:"Giant",          w:25},
 {k:"hMin",v:145, up:0, icon:"📐", ko:"작은 영혼",      en:"Pocket-sized",   w:22},
 {k:"hMin",v:138, up:0, icon:"📐", ko:"더 작은 영혼",   en:"Tiny Soul",      w:24},
 {k:"wMax",v:120, up:1, icon:"🏋", ko:"거구의 생",      en:"Heavyweight",    w:22},
 {k:"wMin",v:35,  up:0, icon:"🪶", ko:"깃털의 생",      en:"Featherweight",  w:22},
 {k:"life",v:95,  up:1, icon:"⏳", ko:"장수의 생",      en:"Long-lived",     w:22},
 {k:"life",v:100, up:1, icon:"⏳", ko:"백세인",         en:"Centenarian",    w:24},
 {k:"top", v:1,   up:0, icon:"💰", ko:"상위 1%의 생",   en:"Top 1%",         w:23},
 {k:"top", v:0.1, up:0, icon:"💰", ko:"상위 0.1%의 생", en:"Top 0.1%",       w:25},
];
/* ── 수집형 업적 — 종교·민족은 나라와 달리 여러 나라에서 겹쳐 나온다 ── */
const REL_TIERS=[
 {n:5,  ko:"여러 믿음",   en:"Many Faiths"},
 {n:10, ko:"종교 순례자", en:"Faith Pilgrim"},
 {n:16, ko:"모든 믿음",   en:"All Faiths"},
];
const ETH_TIERS=[
 {n:10,  ko:"여러 핏줄",     en:"Many Bloodlines"},
 {n:30,  ko:"민족 수집가",   en:"Ethnic Collector"},
 {n:60,  ko:"인류의 표본",   en:"Sample of Humankind"},
 {n:100, ko:"백 갈래의 뿌리",en:"Hundred Roots"},
];
/* 전체 목록은 데이터에서 만든다 — 종교 16, 민족 312 (데이터가 바뀌면 따라간다).
   개수뿐 아니라 목록 자체가 필요하다: 나라 도감처럼 "뭘 모았고 뭐가 남았나"를 보여줘야 한다. */
export const REL_ALL=(()=>{const s=new Set();for(const k in REL)REL[k].forEach(p=>s.add(p[0]));return [...s];})();
export const ETH_ALL=(()=>{const s=new Set();DATA.forEach(c=>(c.eth||[]).forEach(p=>s.add(p[0])));return [...s];})();
export const REL_TOTAL=REL_ALL.length;
export const ETH_TOTAL=ETH_ALL.length;

/* 기록실 — "가장 ~했던 생"의 실제 값. 아직 없으면 value:null (한 번도 안 뽑은 것). */
export function records(){
 const r=ST.rec||{}, best=rarestProb();
 const rarestName=(()=>{let c=null;for(const i of seenSet){const d=DATA[i];if(d&&(!c||d.pop<c.pop))c=d;}return c;})();
 return [
  {icon:"🧠",ko:"최고 IQ",      en:"Highest IQ",       v:r.iq,   unit:""},
  {icon:"📏",ko:"가장 컸던 키",  en:"Tallest",          v:r.hMax, unit:"cm"},
  {icon:"📐",ko:"가장 작았던 키",en:"Shortest",         v:r.hMin, unit:"cm"},
  {icon:"🏋",ko:"최고 몸무게",   en:"Heaviest",         v:r.wMax, unit:"kg"},
  {icon:"🪶",ko:"최저 몸무게",   en:"Lightest",         v:r.wMin, unit:"kg"},
  /* unit:"yr" 과 rank:true 는 UI가 언어에 맞게 푼다(세 / yrs, 상위 N% / top N%).
     엔진에 한국어를 박으면 안 된다 — 문구 결정은 ui 층 몫이다. */
  {icon:"⏳",ko:"최고 기대수명", en:"Longest life",     v:r.life, unit:"yr"},
  {icon:"💰",ko:"최고 소득 분위",en:"Best income rank",
   v:r.top==null?null:Math.round(r.top*100)/100, unit:"%", rank:true},
  /* 나라 이름은 표시할 때 현재 언어로 바꿔야 하므로 나라 객체를 그대로 넘긴다 */
  {icon:"🎰",ko:"가장 희귀했던 나라",en:"Rarest country", country:rarestName||null,
   note:best==null?"":"1/"+Math.round(1/best).toLocaleString()},
 ];
}

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

 const r=ST.rec||{};
 REC.forEach(x=>{ const v=r[x.k];
  if(v!=null&&(x.up?v>=x.v:v<=x.v))
   out.push({id:"rec_"+x.k+"_"+x.v,icon:x.icon,ko:x.ko,en:x.en,w:x.w}); });

 REL_TIERS.forEach((x,i)=>{ if(relSet.size>=x.n)
  out.push({id:"rel"+x.n,icon:"🙏",ko:x.ko,en:x.en,w:26+i}); });
 ETH_TIERS.forEach((x,i)=>{ if(ethSet.size>=x.n)
  out.push({id:"eth"+x.n,icon:"🧬",ko:x.ko,en:x.en,w:26+i}); });

 return out.sort((a,b)=>b.w-a.w);
}

/* 이번 생의 기록을 남긴다. recordLife()에서 persist() 직전에 부른다 —
   여기서 안 담으면 업적을 계산할 근거가 아예 없다(나라만 seen에 남는다). */
export function noteLife(l){
 if(!l)return;
 const r=ST.rec;
 const put=(k,v,up)=>{ if(typeof v!=="number"||!isFinite(v))return;
  if(r[k]==null||(up?v>r[k]:v<r[k]))r[k]=v; };
 put("iq",l.iq,1);
 put("hMax",l.height,1); put("hMin",l.height,0);
 put("wMax",l.weight,1); put("wMin",l.weight,0);
 put("life",l.lifeExp,1);
 put("top",l.top,0);          /* 소득 상위 %는 작을수록 좋다 */
 if(l.rel&&l.rel[0])relSet.add(l.rel[0]);
 if(l.eth&&l.eth[0])ethSet.add(l.eth[0]);
}

/* 업적 목록 화면용 — 딴 것과 못 딴 것을 진행도와 함께 전부 돌려준다.
   못 딴 것도 보여야 "다음에 뭘 노릴지"가 생긴다. */
export function catalog(){
 const r=ST.rec||{}, best=rarestProb();
 const tier=(items,now)=>items.map(x=>({ko:x.ko,en:x.en,ok:now>=x.n,now:Math.min(now,x.n),goal:x.n}));
 return [
  {icon:"🔁",ko:"환생 횟수",en:"Rebirths",   items:tier(ROLL,ST.total)},
  {icon:"📖",ko:"나라 도감",en:"Country Dex",items:tier(DEX,seenSet.size)},
  {icon:"👑",ko:"대륙 정복",en:"Continents", items:contProgress().map(c=>
    ({ko:c.ko+" 정복자",en:"Conqueror of "+c.en,ok:c.owned>=c.total,now:c.owned,goal:c.total}))},
  {icon:"🙏",ko:"종교",    en:"Religions",  items:tier(REL_TIERS,relSet.size)},
  {icon:"🧬",ko:"민족",    en:"Ethnicities",items:tier(ETH_TIERS,ethSet.size)},
  {icon:"🏆",ko:"기록",    en:"Records",    items:REC.map(x=>{
    const v=r[x.k], ok=v!=null&&(x.up?v>=x.v:v<=x.v);
    const unit=x.k==="top"?"%":x.k==="iq"?"":x.k.startsWith("h")?"cm":x.k.startsWith("w")?"kg":"세";
    return {ko:x.ko,en:x.en,ok,
     note:(x.up?"≥ ":"≤ ")+x.v+unit,
     cur:v==null?null:(Math.round(v*10)/10)+unit};
  })},
  {icon:"🎰",ko:"희귀도",  en:"Rarity",     items:RARE.map(x=>
    ({ko:x.ko,en:x.en,ok:best!==null&&best<=x.p,note:"1/"+Math.round(1/x.p).toLocaleString()}))},
 ];
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
