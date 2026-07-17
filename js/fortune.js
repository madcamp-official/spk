import {$,reduceMotion,mulberry32,strHash,setRNG} from "./util.js";
import {ST} from "./state.js";
import {rollLife} from "./roll.js";
import {renderLife,recordLife} from "./render.js";
import {track,sendDwell} from "./track.js";
import {toast} from "./effects.js";

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
$("fortuneBtn").addEventListener("click",()=>{
 sendDwell("fortune");
 const key=todayKey();
 const rng=mulberry32(strHash(key+"|"+ST.dev));
 let life,msg;
 setRNG(rng);
 try{
  life=rollLife();
  msg=FORTUNES[Math.floor(rng()*FORTUNES.length)];
 }finally{setRNG(Math.random);}
 life.fortune="오늘의 운세: "+msg;
 const first=ST.fortuneDay!==key;
 if(first){ST.fortuneDay=key;recordLife(life);}
 renderLife(life);
 $("lifeNo").textContent="오늘("+key+")의 운세 환생";
 track("fortune",{country:life.c.name,first});
 if(!first)toast("오늘의 운세는 하루 동안 같아요. 내일 또 만나요 🌙");
 $("hero").scrollIntoView({behavior:reduceMotion?"auto":"smooth"});
});
