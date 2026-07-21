import {DATA,TOTAL,REL} from "../../core/data.js";
import {ST,seenSet,relSet,ethSet} from "../core/state.js";

/* ===== 칭호 · 마일스톤 =====
   198개국 도감을 다 채우는 건 확률상 사실상 불가능하다(모나코 하나가 20만분의 1이라
   기대 환생 횟수가 수십만 회). 최종 목표 하나만 두면 "어차피 못 한다"가 되어 오히려
   이탈한다. 그래서 중간 목표를 잘게 쪼개 늘 다음 한 칸이 보이게 한다.

   이 모듈은 순수 로직이다 — DOM도 i18n도 모른다(README의 의존 방향: core → engine → ui).
   문구는 들고 있지 않고 **한국어 사전 키(k)만** 돌려준다. 번역은 i18n의 STR이 갖고,
   UI가 t(k)로 푼다 — 레포 규칙대로 6개 언어가 한곳에서 관리된다.
   대륙 칭호는 "{cont} 정복자" 템플릿 + 대륙 코드로 준다. UI가 contName()으로 채운다. */

const ROLL=[
 /* 1회짜리를 둔 건 인심이 아니라 발견성 때문이다 — 첫 칭호가 10회에나 붙으면
    대부분은 칭호 체계가 있다는 것조차 모르고 떠난다. */
 {n:1,    k:"첫 생"},
 {n:10,   k:"윤회 입문자"},
 {n:50,   k:"환생 단골"},
 {n:100,  k:"삼사라 중독자"},
 {n:500,  k:"윤회의 달인"},
 {n:1000, k:"천 번의 생"},
 {n:5000, k:"초월자"},
];
const DEX=[
 {n:10,  k:"첫 수집가"},
 {n:30,  k:"지구 여행자"},
 {n:60,  k:"대륙 순례자"},
 {n:100, k:"백 개국의 영혼"},
 {n:150, k:"지도 정복자"},
 {n:198, k:"완전한 도감"},
];
/* 최고 희귀 기록(가장 작은 확률)으로 주는 칭호 */
const RARE=[
 {p:1/10000,  k:"로또 영혼"},
 {p:1/50000,  k:"기적의 확률"},
 {p:1/200000, k:"우주가 봐준 생"},
];
/* ── 기록형 업적 — "가장 ~했던 생"을 기억한다 ──
   나라 도감이 "무엇을 모았나"라면 이쪽은 "어디까지 극단을 봤나"다. 이미 뽑고 있는 지표라
   새 데이터가 필요 없다. 값은 ST.rec 에 누적된다(state.js).
   ⚠ 문턱은 반드시 roll.js가 실제로 만들 수 있는 범위 안이어야 한다. 안 그러면 영영 못 따는
   낚시 업적이 된다: IQ는 clamp(...,50,150)이라 150이 상한, 키는 130~215, BMI는 13.5~48.
   f = ST.rec 의 필드, k = 사전 키. up:1 = 클수록 좋음, up:0 = 작을수록 좋음(소득 상위 % 등). */
const REC=[
 {f:"iq",  v:130, up:1, icon:"🧠", k:"수재의 생",      w:22},
 {f:"iq",  v:140, up:1, icon:"🧠", k:"천재의 생",      w:23},
 {f:"iq",  v:150, up:1, icon:"🧠", k:"IQ 상한의 생",   w:25},
 {f:"hMax",v:190, up:1, icon:"📏", k:"장신의 생",      w:22},
 {f:"hMax",v:200, up:1, icon:"📏", k:"거인의 생",      w:25},
 {f:"hMin",v:145, up:0, icon:"📐", k:"작은 영혼",      w:22},
 {f:"hMin",v:138, up:0, icon:"📐", k:"더 작은 영혼",   w:24},
 {f:"wMax",v:120, up:1, icon:"🏋", k:"거구의 생",      w:22},
 {f:"wMin",v:35,  up:0, icon:"🪶", k:"깃털의 생",      w:22},
 {f:"life",v:95,  up:1, icon:"⏳", k:"장수의 생",      w:22},
 {f:"life",v:100, up:1, icon:"⏳", k:"백세인",         w:24},
 {f:"top", v:1,   up:0, icon:"💰", k:"상위 1%의 생",   w:23},
 {f:"top", v:0.1, up:0, icon:"💰", k:"상위 0.1%의 생", w:25},
];
/* ── 수집형 업적 — 종교·민족은 나라와 달리 여러 나라에서 겹쳐 나온다 ── */
const REL_TIERS=[
 {n:5,  k:"여러 믿음"},
 {n:10, k:"종교 순례자"},
 {n:16, k:"모든 믿음"},
];
const ETH_TIERS=[
 {n:10,  k:"여러 핏줄"},
 {n:30,  k:"민족 수집가"},
 {n:60,  k:"인류의 표본"},
 {n:100, k:"백 갈래의 뿌리"},
];

/* 전체 목록은 데이터에서 만든다 — 종교 16, 민족 312 (데이터가 바뀌면 따라간다).
   개수뿐 아니라 목록 자체가 필요하다: 나라 도감처럼 "뭘 모았고 뭐가 남았나"를 보여줘야 한다. */
export const REL_ALL=(()=>{const s=new Set();for(const k in REL)REL[k].forEach(p=>s.add(p[0]));return [...s];})();
export const ETH_ALL=(()=>{const s=new Set();DATA.forEach(c=>(c.eth||[]).forEach(p=>s.add(p[0])));return [...s];})();
export const REL_TOTAL=REL_ALL.length;
export const ETH_TOTAL=ETH_ALL.length;

/* 대륙별 전체 국가 수는 데이터에서 센다 — data.js가 바뀌어도 따라간다 */
const CONT_TOTAL={};
for(const c of DATA)CONT_TOTAL[c.cont]=(CONT_TOTAL[c.cont]||0)+1;
export const CONT_CODES=Object.keys(CONT_TOTAL);

/* 대륙별로 몇 개국을 태어나 봤나 */
export function contProgress(){
 const owned={};
 for(const i of seenSet){const c=DATA[i];if(c)owned[c.cont]=(owned[c.cont]||0)+1;}
 return CONT_CODES.map(code=>({
  code, owned:owned[code]||0, total:CONT_TOTAL[code],
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
function rarestCountry(){
 let c=null;for(const i of seenSet){const d=DATA[i];if(d&&(!c||d.pop<c.pop))c=d;}return c;
}

/* 기록실 — "가장 ~했던 생"의 실제 값. 아직 없으면 v:null (한 번도 안 뽑은 것).
   unit:"yr" 과 rank:true 는 표시 힌트다 — "세/yrs", "상위 N%/top N%" 같은 문구는
   ui 층이 언어에 맞게 푼다. 엔진에 한국어를 박지 않는다. */
export function records(){
 const r=ST.rec||{}, best=rarestProb();
 return [
  {icon:"🧠",k:"최고 IQ",        v:r.iq,   unit:""},
  {icon:"📏",k:"가장 컸던 키",   v:r.hMax, unit:"cm"},
  {icon:"📐",k:"가장 작았던 키", v:r.hMin, unit:"cm"},
  {icon:"🏋",k:"최고 몸무게",    v:r.wMax, unit:"kg"},
  {icon:"🪶",k:"최저 몸무게",    v:r.wMin, unit:"kg"},
  {icon:"⏳",k:"최고 기대수명",  v:r.life, unit:"yr"},
  {icon:"💰",k:"최고 소득 분위", v:r.top==null?null:Math.round(r.top*100)/100, unit:"%", rank:true},
  /* 나라 이름은 표시할 때 현재 언어로 바꿔야 하므로 나라 객체를 그대로 넘긴다 */
  {icon:"🎰",k:"가장 희귀했던 나라", country:rarestCountry(),
   note:best==null?"":"1/"+Math.round(1/best).toLocaleString()},
 ];
}

/* 획득한 칭호 전부. w(무게)가 클수록 자랑할 만한 것 — 대표 칭호를 고르는 기준이다.
   무게 순서: 누적 횟수 < 희귀도 < 대륙 탐험 < 도감 < 대륙 정복.
   ⚠ 희귀도를 일부러 낮게 뒀다. 나라를 많이 모으면 작은 나라가 저절로 딸려 와서
   수집가에겐 자동으로 붙는다 — 위에 두면 도감 47개국이든 190개국이든 대표 칭호가
   똑같이 "우주가 봐준 생"으로 고정돼 성장이 안 보인다. 희귀도는 초반 운을 기념하는 자리다. */
export function earned(){
 const out=[], best=rarestProb(), r=ST.rec||{};

 ROLL.forEach((x,i)=>{ if(ST.total>=x.n)
  out.push({id:"roll"+x.n,icon:"🔁",k:x.k,w:10+i}); });

 DEX.forEach((x,i)=>{ if(seenSet.size>=x.n)
  out.push({id:"dex"+x.n,icon:"📖",k:x.k,w:30+i}); });

 for(const c of contProgress()){
  if(c.owned>=c.total)
   /* 큰 대륙일수록 어렵다 — 아시아(50) 정복이 남아메리카(12)보다 위 */
   out.push({id:"conq"+c.code,icon:"👑",k:"{cont} 정복자",cont:c.code,w:40+c.total/10});
  else if(c.owned*2>=c.total)
   out.push({id:"exp"+c.code,icon:"🧭",k:"{cont} 탐험가",cont:c.code,w:25+c.total/50});
 }

 if(best!==null)RARE.forEach((x,i)=>{ if(best<=x.p)
  out.push({id:"rare"+i,icon:"🎰",k:x.k,w:20+i}); });

 REC.forEach(x=>{ const v=r[x.f];
  if(v!=null&&(x.up?v>=x.v:v<=x.v))
   out.push({id:"rec_"+x.f+"_"+x.v,icon:x.icon,k:x.k,w:x.w}); });

 REL_TIERS.forEach((x,i)=>{ if(relSet.size>=x.n)
  out.push({id:"rel"+x.n,icon:"🙏",k:x.k,w:26+i}); });
 ETH_TIERS.forEach((x,i)=>{ if(ethSet.size>=x.n)
  out.push({id:"eth"+x.n,icon:"🧬",k:x.k,w:26+i}); });

 return out.sort((a,b)=>b.w-a.w);
}

/* 첫 화면·공유 카드에 박히는 대표 칭호 (없으면 null) */
export function topTitle(){ return earned()[0]||null; }

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
/* tier·대륙은 now/goal(진행도)로 조건을 상시 보여주므로 값이 따로 필요 없다.
   기록·희귀도만 cur를 둔다 — 상시 줄은 조건(≥130·1/10,000)만 보여주고, 딴 뒤 hover로
   내 실제 기록(143·1/737,104)을 보태는 데 쓴다(achievements.js howHTML). */
export function catalog(){
 const r=ST.rec||{}, best=rarestProb();
 const tier=(items,now)=>items.map(x=>({k:x.k,ok:now>=x.n,now:Math.min(now,x.n),goal:x.n}));
 return [
  {icon:"🔁",k:"환생 횟수",items:tier(ROLL,ST.total)},
  {icon:"📖",k:"나라 도감",items:tier(DEX,seenSet.size)},
  {icon:"👑",k:"대륙 정복",items:contProgress().map(c=>
    ({k:"{cont} 정복자",cont:c.code,ok:c.owned>=c.total,now:c.owned,goal:c.total}))},
  {icon:"🙏",k:"종교",items:tier(REL_TIERS,relSet.size)},
  {icon:"🧬",k:"민족",items:tier(ETH_TIERS,ethSet.size)},
  {icon:"🏆",k:"기록",items:REC.map(x=>{
    const v=r[x.f], ok=v!=null&&(x.up?v>=x.v:v<=x.v);
    const unit=x.f==="top"?"%":x.f==="iq"?"":x.f[0]==="h"?"cm":x.f[0]==="w"?"kg":"yr";
    const fmt=n=>n+(unit==="yr"?"":unit);
    return {k:x.k,ok,note:(x.up?"≥ ":"≤ ")+fmt(x.v),cur:v==null?null:fmt(v)};
  })},
  {icon:"🎰",k:"희귀도",items:RARE.map(x=>
    ({k:x.k,ok:best!==null&&best<=x.p,note:"1/"+Math.round(1/x.p).toLocaleString(),
      cur:best==null?null:"1/"+Math.round(1/best).toLocaleString()}))},
 ];
}

/* 다음 목표 하나. "어차피 못 한다"를 막는 장치라 항상 가장 가까운 것을 준다. */
export function nextGoal(){
 const cands=[];
 const r=ROLL.find(x=>ST.total<x.n);
 if(r)cands.push({k:r.k,icon:"🔁",now:ST.total,goal:r.n});
 const d=DEX.find(x=>seenSet.size<x.n);
 if(d)cands.push({k:d.k,icon:"📖",now:seenSet.size,goal:d.n});
 for(const c of contProgress()){
  if(c.owned<c.total&&c.owned*2>=c.total)
   cands.push({k:"{cont} 정복자",cont:c.code,icon:"👑",now:c.owned,goal:c.total});
 }
 /* 남은 양이 가장 적은 것 = 손에 가장 가까운 목표 */
 return cands.sort((a,b)=>(a.goal-a.now)-(b.goal-b.now))[0]||null;
}
