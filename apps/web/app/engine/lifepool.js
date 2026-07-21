import {rollLife} from "../../core/roll.js";
import {decodeLife} from "./permalink.js";

/* ===== 서명된 생을 미리 받아 둔다 =====
   생은 서버가 뽑아야 서명에 뜻이 생긴다(이유는 server/counter.js 머리말).
   그런데 리롤을 누를 때마다 서버를 기다리면 "클릭 경로에 1ms도 더하지 않는다"가 깨진다.
   그래서 20개를 미리 받아 두고, 클릭 때는 배열에서 꺼내기만 한다. 네트워크는 항상
   클릭 경로 바깥에서만 돈다. takeLife()에 await가 없는 건 그래서다.

   버퍼가 비었거나 서버가 없으면(로컬에서 index.html만 띄운 경우) 로컬에서 뽑는다.
   그 생은 sig가 없어서 공유 링크에 실리지 않는다 — 보증할 수 없는 걸 보증된 척
   내보내느니 예전처럼 문구만 공유되는 게 낫다. */
const POOL=[];
const WANT=20;   /* 한 번에 받아 오는 개수 */
const LOW=6;     /* 이만큼 남으면 미리 채운다 — 다 쓰고 나서 받으면 그 클릭이 로컬로 샌다 */
let inflight=false,fails=0,nextTry=0;

export function refill(){
 if(inflight||POOL.length>=LOW||Date.now()<nextTry)return;
 inflight=true;
 fetch("/api/roll?n="+WANT,{cache:"no-store"})
  .then(r=>r.ok?r.json():Promise.reject(r.status))
  .then(d=>{
   if(Array.isArray(d.lives))for(const x of d.lives)if(x&&x.l&&x.sig)POOL.push(x);
   fails=0;
  })
  /* 서버 부팅 중에도 503이 잠깐 난다. 영영 포기하면 그 세션은 계속 미서명이 되므로
     끄지 않고 물러선다(1s→2s→4s…30s). */
  .catch(()=>{fails++;nextTry=Date.now()+Math.min(30000,1000*Math.pow(2,fails));})
  .finally(()=>{inflight=false;});
}
refill(); /* 첫 클릭이 버퍼를 만나도록 로드 즉시 시작한다 */

/* 리롤 클릭이 부른다. 동기 — 절대 기다리지 않는다. */
export function takeLife(){
 const s=POOL.shift();
 /* 여기서 refill()을 바로 부르면 fetch를 시작하는 비용이 클릭 경로에 실린다.
    다음 틱으로 미루면 결과를 그린 뒤에 돈다 — 어차피 20개 중 하나를 꺼낸 참이라 급하지 않다. */
 setTimeout(refill,0);
 if(s){
  const l=decodeLife(s.l,false); /* false = 내 생. 도감·통계에 들어간다 */
  /* 서버가 보낸 값이 우리 파서를 못 통과하면(배포 시점이 어긋난 경우 등) 로컬로 떨어진다 */
  if(l){l.sig=s.sig;return l;}
 }
 return rollLife();
}

/* 운세는 날짜+기기 시드라 서버도 똑같이 재현할 수 있다. 하루 한 번 누르는 버튼이라
   여기서는 기다려도 된다 — 리롤과 달리 연타 경로가 아니다.
   못 받아 오면 null. 호출부가 로컬 시드 뽑기로 떨어진다. */
export async function takeFortune(key,dev){
 try{
  const r=await fetch("/api/fortune?key="+encodeURIComponent(key)+"&dev="+encodeURIComponent(dev),
   {cache:"no-store"});
  if(!r.ok)return null;
  const d=await r.json();
  const l=decodeLife(d.l,false);
  if(l){l.sig=d.sig;return l;}
 }catch(e){}
 return null;
}

/* 짧은 코드(?s=)로 공유받은 생을 서버에서 가져온다. 서버는 서명을 통과한 생만 저장하므로
   여기서 돌아온 것은 이미 진짜다 — 따로 verify하지 않는다(저장됐다는 게 곧 증거).
   못 찾거나(만료·오타) 서버가 없으면 null → 호출부가 안내 문구를 띄운다.
   shared=true로 디코드해 남의 생임을 표시한다(내 도감·통계에 안 들어간다). */
export async function takeSharedByCode(code){
 if(!code)return null;
 try{
  const r=await fetch("/api/shared?s="+encodeURIComponent(code),{cache:"no-store"});
  if(!r.ok)return null;
  const d=await r.json();
  const l=decodeLife(d.l,true);
  if(l){l.sig=d.sig;return l;}
 }catch(e){}
 return null;
}

/* 공유받은 링크가 진짜인지는 서버만 안다(키가 서버에만 있으므로).
   못 물어보면 false — "확인 못 함"을 "괜찮음"으로 취급하면 서명을 붙인 의미가 없다. */
export async function verifyLife(l,sig){
 if(!l||!sig)return false;
 try{
  const r=await fetch("/api/verify?l="+encodeURIComponent(l)+"&sig="+encodeURIComponent(sig),
   {cache:"no-store"});
  if(!r.ok)return false;
  return !!(await r.json()).ok;
 }catch(e){return false;}
}
