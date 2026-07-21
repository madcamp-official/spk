import {DATA,TOTAL} from "../../core/data.js";
import {$,fmtPct,isoCode} from "../core/util.js";
import {seenSet} from "../core/state.js";
import {flagOK} from "./flags.js";
import {rarityColor} from "../../core/roll.js";
import {track} from "../analytics/track.js";
import {t,countryName} from "../i18n/i18n.js";

/* ===== 환생 도감 ===== */
export function openDex(){
 const sorted=[...DATA].map((c,i)=>({c,i})).sort((a,b)=>b.c.pop-a.c.pop);
 $("dexGrid").innerHTML=sorted.map(({c,i})=>{
  const owned=seenSet.has(i);
  const fl=flagOK?'<span class="dex-flag">'+c.flag+'</span>'
   :'<span class="dex-flag dex-code">'+isoCode(c.flag)+'</span>';
  return '<div class="dex-item'+(owned?" owned":"")+'" style="--tc:'+rarityColor(c.pop)+'">'
   +fl+'<span class="dex-name">'+countryName(c)+'</span><span class="dex-prob">'+fmtPct(c.pop/TOTAL)+"</span></div>";
 }).join("");
 $("dexProgress").textContent=t("수집한 나라 {a} / {b} ({p}%) · 밝은 칸이 태어나 본 나라입니다",
  {a:seenSet.size,b:DATA.length,p:Math.round(seenSet.size/DATA.length*100)});
 $("dexModal").hidden=false;
 document.body.style.overflow="hidden";
 track("collection_open",{owned:seenSet.size});
}
export function closeDex(){$("dexModal").hidden=true;document.body.style.overflow="";}
$("dexBtn").addEventListener("click",openDex);
$("dexClose").addEventListener("click",closeDex);
