/* ===== 저장 상태 (localStorage) ===== */
/* rec·relSeen·ethSeen 은 업적용 누적 기록이다(실험).
   나라(seen)와 달리 지금까지는 아무 데도 안 남던 값들 — 최고 IQ, 최장신, 겪어본 종교 등.
   여기 없으면 업적을 계산할 근거 자체가 없어서 상태에 추가했다. */
export let ST={total:0,seen:[],best:null,dev:null,ab:null,vIn:null,viaIn:null,refFirst:null,metrics:{},suggests:[],fortuneDay:null,
 rec:{},relSeen:[],ethSeen:[]};
try{const s=localStorage.getItem("rebirth_state");if(s)ST=Object.assign(ST,JSON.parse(s));}catch(e){}
/* 손상·구버전 저장 데이터 방어 */
if(!Array.isArray(ST.seen))ST.seen=[];
if(typeof ST.total!=="number"||!isFinite(ST.total))ST.total=0;
if(typeof ST.metrics!=="object"||!ST.metrics)ST.metrics={};
/* 업적 기록도 같은 방어를 받는다 — 이 필드들이 없던 시절의 저장본이 그대로 올라온다 */
if(typeof ST.rec!=="object"||!ST.rec)ST.rec={};
if(!Array.isArray(ST.relSeen))ST.relSeen=[];
if(!Array.isArray(ST.ethSeen))ST.ethSeen=[];
export const seenSet=new Set(ST.seen);
export const relSet=new Set(ST.relSeen);
export const ethSet=new Set(ST.ethSeen);
export function persist(){try{
 ST.seen=[...seenSet];ST.relSeen=[...relSet];ST.ethSeen=[...ethSet];
 localStorage.setItem("rebirth_state",JSON.stringify(ST));
}catch(e){}}

/* 지금 보고 있는 생. 여러 모듈(트래킹·공유·제안)이 함께 읽고 쓰기 때문에
   모듈 지역 변수 대신 이 객체 하나에 모아 둔다.
   lastActiveAt = 마지막 상호작용 시각. dwell 시계가 "자리를 비운" 시간을 빼는 기준이다.
   rollIdx·sincePrevRollMs·quickReroll = 이번 세션에서 이 생이 몇 번째 리롤인지와
   직전 리롤과의 간격. roll·dwell 이벤트에 실어 세션 안 몰입 곡선을 읽는다. */
/* shareMode = 공유 시트가 지금 무엇을 내보내는가. 결과 카드(생)와 프로필(누적)이
   같은 시트 DOM(#shareModal)을 나눠 쓰기 때문에, 어느 흐름이 채널 버튼을 처리할지
   이 한 값으로 가른다. share.js(생)와 profile.js(프로필)가 각자 이 값을 보고 자기 차례만 처리한다. */
export const session={currentLife:null,lifeShownAt:0,lastActiveAt:0,dwellSent:false,
 lifeShared:false,rollIdx:0,sincePrevRollMs:0,quickReroll:false,shareMode:"life"};
