import {DATA,TOTAL,CUM,REL,RARITY,P_MALE,SIGMA} from "../core/data.js";
import {rand,gauss,phi,clamp,pickWeighted,strHash,mulberry32,isoCode} from "../core/util.js";

/* ===== 환생 로직 ===== */
export function pickCountryIdx(){const r=rand()*TOTAL;let lo=0,hi=CUM.length-1;
 while(lo<hi){const m=(lo+hi)>>1; if(CUM[m]<r)lo=m+1; else hi=m;} return lo;}
export function incomeTopPct(v){let a=0;
 for(const c of DATA)a+=(c.pop/TOTAL)*phi((Math.log(v)-Math.log(c.gdp))/SIGMA);
 return clamp((1-a)*100,0.01,99.9);}
export function rarityColor(pop){for(const t of RARITY)if(pop>=t.min)return t.color;return RARITY[RARITY.length-1].color;}
/* 키는 국가·성별 평균에 개인 편차를 더한다(성인 키 표준편차는 대략 남 7cm / 여 6.4cm).
   몸무게는 국가 평균 BMI에 개인 편차를 더해 뽑은 뒤 그 사람의 키로 역산한다 —
   그래서 키가 크면 같은 BMI라도 몸무게가 자연히 늘어난다. 소득을 1인당 GDP에서
   로그정규로 뽑는 것과 같은 방식의 추정이다. */
export function rollBody(c,male){
 const height=clamp(Math.round((male?c.hm:c.hf)+gauss()*(male?7:6.4)),130,215);
 const bmi=clamp(c.bmi+gauss()*4.2,13.5,48);
 const weight=Math.round(bmi*Math.pow(height/100,2)*10)/10;
 return {height,weight,bmi};
}
/* IQ는 나라와 무관하게 뽑는다. IQ 검사 점수는 애초에 어떤 집단에서든 평균 100·표준편차 15가
   되도록 규준화한 값이라 "이 나라 평균 IQ" 같은 건 이 척도 안에 존재하지 않는다.
   국가별 IQ를 내세우는 자료(Lynn 등)가 있긴 하나 표본이 수십 명이거나 이웃 나라 값으로
   채운 것이 많아 폐기된 자료다. 그래서 나라와 무관하게 어디서 태어나든 같은 분포에서 뽑는다. */
export function rollIQ(){return clamp(Math.round(100+gauss()*15),50,150);}
export function iqTopPct(iq){return clamp((1-phi((iq-100)/15))*100,0.01,99.9);}
/* 사망 원인 — 죽는 나이(기대수명)에 따라 분포가 크게 달라진다. 젊어 죽을수록 사고·감염병,
   늙어 죽을수록 심장병·암·치매·노환 쪽으로 기운다(WHO 전 세계 사인 구조의 큰 얼개다).
   국가별 사인 통계는 198개국을 고르게 덮지 못해(왼손잡이·탈모와 같은 사정) 나라로 가르지
   않고 죽는 나이 하나로만 기운다.
   뽑기용 난수(rand) 대신 이 생의 고정값(나라·수명·소득·IQ·키·몸무게)을 해시해 시드로 쓴다 —
   그래야 공유 링크로 복원한 생도, 오늘의 운세로 다시 그린 생도 늘 같은 사인이 나온다.
   덕분에 사인은 링크에 따로 싣지 않아도 되고, 이미 뿌린 링크(왼손잡이 칸이 있던 옛 형식)도
   그대로 사인을 되찾는다. 표시 문구는 i18n에서 번역되므로 여기엔 키·이모지만 둔다
   (서버도 이 파일을 import하므로 i18n을 불러올 수 없다). */
const CAUSES=[
 {key:"심장병",     emoji:"🫀", wt:a=>10+(a-45)*0.9},
 {key:"암",         emoji:"🎗️", wt:a=>8+(a-45)*0.5},
 {key:"뇌졸중",     emoji:"🧠", wt:a=>6+(a-45)*0.4},
 {key:"호흡기 질환", emoji:"🫁", wt:a=>5+(a-45)*0.35},
 {key:"당뇨 합병증", emoji:"🩸", wt:a=>4+(a-45)*0.15},
 {key:"간 질환",    emoji:"🍺", wt:(a,m)=>clamp(12-Math.abs(a-58)*0.25,3,12)*(m?1.6:1)},
 {key:"감염병",     emoji:"🦠", wt:a=>clamp(22-(a-45)*0.35,4,22)},
 {key:"사고",       emoji:"🚗", wt:(a,m)=>clamp(30-(a-45)*0.6,3,30)*(m?1.4:1)},
 {key:"치매",       emoji:"🧩", wt:(a,m)=>clamp((a-70)*1.6,0,40)*(m?1:1.2)},
 {key:"노환",       emoji:"🕯️", wt:a=>clamp((a-82)*2.2,0,40)},
];
export function rollCause(l){
 const seed=strHash([isoCode(l.c.flag),l.lifeExp,Math.round(l.income),l.iq,l.height,Math.round(l.weight*10)].join("-"));
 const rng=mulberry32(seed);
 const a=l.lifeExp,m=!!l.male;
 let sum=0;const w=CAUSES.map(cs=>{const x=Math.max(0,cs.wt(a,m));sum+=x;return x;});
 let r=rng()*sum;
 for(let i=0;i<CAUSES.length;i++){r-=w[i];if(r<=0)return CAUSES[i];}
 return CAUSES[0];
}
export function rollLife(fCi,fMale){
 const ci=fCi!=null?fCi:pickCountryIdx(), c=DATA[ci];
 const male=fMale!=null?fMale:rand()<P_MALE;
 const urban=rand()<c.urban/100;
 const rel=pickWeighted(REL[c.rel]);
 const eth=pickWeighted(c.eth);
 /* 안드로겐성 탈모. 성별이 압도적인 변수라 성별로만 뽑는다(키·IQ와 달리 나라별로 안 가른다).
    50세까지 남성 약 50% · 여성 약 20%는 널리 인용되는 대략치다.
    나라별로 넣지 않은 이유: 키(NCD-RisC)와 달리 탈모는 198개국을 덮는 조사가 없다.
    동아시아 남성이 유럽계보다 낮다는 건 여러 연구에서 반복 확인되지만, 조사마다 연령대와
    기준(Norwood 등급 컷오프)이 달라 국가별 숫자로 옮기면 대부분 지어내는 값이 된다. */
 const balding=rand()<(male?0.50:0.20);
 const lifeExp=clamp(Math.round(c.life+gauss()*7),45,106);
 const income=c.gdp*Math.exp(gauss()*SIGMA);
 const top=incomeTopPct(income);
 const body=rollBody(c,male);
 const iq=rollIQ();
 const pC=c.pop/TOTAL,pG=male?P_MALE:1-P_MALE,pU=urban?c.urban/100:1-c.urban/100;
 const l={ci,c,male,urban,rel,eth,balding,lifeExp,income,top,iq,...body,prob:pC*pG*pU};
 l.cause=rollCause(l);
 return l;
}
