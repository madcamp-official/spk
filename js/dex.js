import {DATA,TOTAL} from "./data.js";
import {$,fmtPct,isoCode} from "./util.js";
import {seenSet} from "./state.js";
import {flagOK} from "./flags.js";
import {rarityColor} from "./roll.js";
import {track} from "./track.js";

/* ===== 환생 도감 ===== */
export function openDex(){
 const sorted=[...DATA].map((c,i)=>({c,i})).sort((a,b)=>b.c.pop-a.c.pop);
 $("dexGrid").innerHTML=sorted.map(({c,i})=>{
  const owned=seenSet.has(i);
  const fl=flagOK?'<span class="dex-flag">'+c.flag+'</span>'
   :'<span class="dex-flag dex-code">'+isoCode(c.flag)+'</span>';
  return '<div class="dex-item'+(owned?" owned":"")+'" style="--tc:'+rarityColor(c.pop)+'">'
   +fl+'<span class="dex-name">'+c.name+'</span><span class="dex-prob">'+fmtPct(c.pop/TOTAL)+"</span></div>";
 }).join("");
 $("dexProgress").textContent="수집한 나라 "+seenSet.size+" / "+DATA.length
  +" ("+Math.round(seenSet.size/DATA.length*100)+"%) · 밝은 칸이 태어나 본 나라입니다";
 $("dexModal").hidden=false;
 document.body.style.overflow="hidden";
 track("collection_open",{owned:seenSet.size});
}
export function closeDex(){$("dexModal").hidden=true;document.body.style.overflow="";}
$("dexBtn").addEventListener("click",openDex);
$("dexClose").addEventListener("click",closeDex);
