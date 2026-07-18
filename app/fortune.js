import {$,reduceMotion,mulberry32,strHash,setRNG} from "./core/util.js";
import {ST} from "./core/state.js";
import {rollLife} from "./engine/roll.js";
import {renderLife,recordLife} from "./render.js";
import {track,sendDwell} from "./track.js";
import {toast} from "./effects.js";
import {takeFortune} from "./engine/lifepool.js";
import {t} from "./i18n/i18n.js";

/* ===== 오늘의 환생 운세 (날짜+기기 시드라 하루 동안 같은 결과) ===== */
const FORTUNES=[
 "낯선 나라의 음식을 먹으면 행운이 따라옵니다",
 "오늘의 인연은 생각보다 가까운 곳에 있습니다. 인사를 먼저 건네 보세요",
 "리롤이 곧 복권입니다. 오늘은 손이 따뜻한 날이네요",
 "지도를 펼쳐 보세요. 다음 여행지가 오늘의 나라일지도 모릅니다",
 "오늘 배운 외국어 한 마디가 언젠가 당신을 구합니다",
 "이번 생은 연습이 아닙니다. 오늘 하루도 본편입니다",
 "오늘의 우연이 당신의 결정을 조용히 응원하고 있습니다",
 "잃어버린 물건이 서랍 두 번째 칸에서 기다립니다",
 "누군가에게 이 결과를 공유하면 웃음이 두 배가 됩니다",
 "오늘은 평소보다 한 정거장 일찍 내려 걸어 보세요",
 "당신이 태어났을 확률을 생각하면, 오늘의 실수쯤은 아무것도 아닙니다",
 "가장 귀한 생은 언제나 지금 이번 생입니다",
];
function todayKey(){const d=new Date();return d.getFullYear()+"-"+(d.getMonth()+1)+"-"+d.getDate();}
/* 운세 문구는 "내가 뽑은 생"이라는 주장이 아니라서 서명할 것이 없다. 생과 시드를 나눠 두면
   서버가 생만 재현하면 되고, 클라는 문구를 알아서 고른다(둘이 같은 rng를 나눠 쓰면
   서버가 생을 뽑느라 rng를 몇 번 당겼는지까지 맞춰야 한다). */
function fortuneMsg(key){return FORTUNES[Math.floor(mulberry32(strHash(key+"|"+ST.dev+"|msg"))()*FORTUNES.length)];}
/* 운세는 날짜+기기 시드라 하루 동안 값이 같고, 그래서 서버도 똑같이 재현해 서명할 수 있다.
   여기서 서버를 기다려도 되는 건 하루 한 번 누르는 버튼이라서다 — 리롤 같은 연타 경로가 아니다. */
$("fortuneBtn").addEventListener("click",async()=>{
 sendDwell("fortune");
 const key=todayKey();
 let life=await takeFortune(key,ST.dev);
 if(!life){ /* 서버가 없으면 예전처럼 로컬에서. sig가 없어 공유 링크에 실리지 않는다. */
  const rng=mulberry32(strHash(key+"|"+ST.dev));
  setRNG(rng);
  try{life=rollLife();}finally{setRNG(Math.random);}
 }
 /* 문구 인덱스는 시드가 정하고(언어와 무관하게 같은 운세), 표시할 때만 번역한다 */
 life.fortune=t("오늘의 운세: ")+t(fortuneMsg(key));
 const first=ST.fortuneDay!==key;
 if(first){ST.fortuneDay=key;recordLife(life);}
 renderLife(life);
 $("lifeNo").textContent=t("오늘({d})의 운세 환생",{d:key});
 track("fortune",{country:life.c.name,first});
 if(!first)toast(t("오늘의 운세는 하루 동안 같아요. 내일 또 만나요 🌙"));
 $("hero").scrollIntoView({behavior:reduceMotion?"auto":"smooth"});
});
