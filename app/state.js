/* ===== 저장 상태 (localStorage) ===== */
export let ST={total:0,seen:[],best:null,dev:null,ab:null,vIn:null,viaIn:null,refFirst:null,metrics:{},suggests:[],fortuneDay:null};
try{const s=localStorage.getItem("rebirth_state");if(s)ST=Object.assign(ST,JSON.parse(s));}catch(e){}
/* 손상·구버전 저장 데이터 방어 */
if(!Array.isArray(ST.seen))ST.seen=[];
if(typeof ST.total!=="number"||!isFinite(ST.total))ST.total=0;
if(typeof ST.metrics!=="object"||!ST.metrics)ST.metrics={};
export const seenSet=new Set(ST.seen);
export function persist(){try{ST.seen=[...seenSet];localStorage.setItem("rebirth_state",JSON.stringify(ST));}catch(e){}}

/* 지금 보고 있는 생. 여러 모듈(트래킹·공유·제안)이 함께 읽고 쓰기 때문에
   모듈 지역 변수 대신 이 객체 하나에 모아 둔다. */
export const session={currentLife:null,lifeShownAt:0,dwellSent:false,lifeShared:false};
