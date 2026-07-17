import {DATA,TOTAL,CUM,REL,RARITY,P_MALE,SIGMA} from "./data.js";
import {rand,gauss,phi,clamp,pickWeighted} from "./util.js";

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
   채운 것이 많아 폐기된 자료다. 그래서 왼손잡이처럼 어디서 태어나든 같은 분포에서 뽑는다. */
export function rollIQ(){return clamp(Math.round(100+gauss()*15),50,150);}
export function iqTopPct(iq){return clamp((1-phi((iq-100)/15))*100,0.01,99.9);}
export function rollLife(fCi,fMale){
 const ci=fCi!=null?fCi:pickCountryIdx(), c=DATA[ci];
 const male=fMale!=null?fMale:rand()<P_MALE;
 const urban=rand()<c.urban/100;
 const rel=pickWeighted(REL[c.rel]);
 const eth=pickWeighted(c.eth);
 const lefty=rand()<0.10;
 const lifeExp=clamp(Math.round(c.life+gauss()*7),45,106);
 const income=c.gdp*Math.exp(gauss()*SIGMA);
 const top=incomeTopPct(income);
 const body=rollBody(c,male);
 const iq=rollIQ();
 const pC=c.pop/TOTAL,pG=male?P_MALE:1-P_MALE,pU=urban?c.urban/100:1-c.urban/100;
 return {ci,c,male,urban,rel,eth,lefty,lifeExp,income,top,iq,...body,prob:pC*pG*pU};
}
