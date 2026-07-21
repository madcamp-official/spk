import {DATA,TOTAL} from "../../core/data.js";
import {$} from "../core/util.js";
import {flagOK,refreshFlagOK} from "./flags.js";
import {t,countryName,bigNum} from "../i18n/i18n.js";

/* ===== 확률 표 ===== */
export function renderOdds(){
 const top=[...DATA].sort((a,b)=>b.pop-a.pop).slice(0,12);
 $("oddsList").innerHTML=top.map(c=>{
  const p=c.pop/TOTAL*100;
  return "<li><span>"+(flagOK?c.flag+" ":"")+countryName(c)+"</span><span class='pc'>"+p.toFixed(1)+"%</span></li>";
 }).join("");
}
renderOdds();
(function(){
 const cnIn=(DATA[0].pop+DATA[1].pop)/TOTAL*100;
 $("oddsNote").textContent=t("중국과 인도만 합쳐도 약 {p}%. 환생 3번 중 1번은 두 나라 중 하나에서 시작됩니다. 반대로 투발루(인구 1.1만 명)가 나올 확률은 약 {n}번 중 1번입니다.",
  {p:cnIn.toFixed(0),n:bigNum(TOTAL*1e6/11000)});
})();

/* 웹폰트가 늦게 도착하므로, 로드된 뒤 국기 지원 여부를 다시 판정하고
   이미 그려진 확률 표를 새 판정으로 다시 그린다(결과 카드·도감은 그릴 때 판정을 읽는다). */
if(document.fonts&&document.fonts.load){
 document.fonts.load('20px "Twemoji Country Flags"',"🇰🇷")
  .then(()=>{if(refreshFlagOK())renderOdds();}).catch(()=>{});
}
