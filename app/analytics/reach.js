import {track,rollsThisSession} from "./track.js";

/* ===== 스크롤 깊이 · 어디까지 내려 보는가 =====
   히어로(결과+리롤 버튼)에서 멈추는 사람과 확률표·제안함·푸터까지 내려가는 사람을 가른다.
   각 랜드마크가 처음 뷰포트에 들어올 때 세션당 한 번씩만 쏜다. rolls_so_far를 함께 실어
   "굴리다가 내려가 본 건지, 안 굴리고 훑기만 한 건지"까지 읽는다.
   IntersectionObserver가 없는(아주 오래된) 브라우저에서는 조용히 계측을 건너뛴다. */
if("IntersectionObserver" in window){
 /* #suggest = 제안 폼, footer = 출처. 모듈은 defer라 이 시점에 DOM이 이미 파싱돼 있어
    바로 질의할 수 있다. (확률표 섹션은 제거됨) */
 const TARGETS=[["suggest","#suggest"],["footer","footer"]];
 const seen=new Set();
 const io=new IntersectionObserver(entries=>{
  for(const e of entries){
   if(!e.isIntersecting)continue;
   const name=e.target.__reach;
   if(seen.has(name))continue;
   seen.add(name);
   track("reach",{section:name,rolls_so_far:rollsThisSession()});
   io.unobserve(e.target);
  }
 },{threshold:0.3});
 for(const [name,sel] of TARGETS){
  const el=document.querySelector(sel);
  if(el){el.__reach=name;io.observe(el);}
 }
}
