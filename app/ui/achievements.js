import {$} from "../core/util.js";
import {cur} from "../i18n/i18n.js";
import {catalog,earned} from "../engine/titles.js";
import {track} from "../analytics/track.js";

/* ===== 업적 목록 =====
   대표 칭호 하나만 보이면 나머지 수십 개는 존재를 모른다. 못 딴 것도 진행도와 함께
   보여야 "다음에 뭘 노릴지"가 생긴다 — 그게 도감작의 동력이다. */
const nm=x=>cur==="ko"?x.ko:x.en;

export function openAch(){
 const groups=catalog();
 const got=earned().length;
 const all=groups.reduce((n,g)=>n+g.items.length,0);
 const done=groups.reduce((n,g)=>n+g.items.filter(i=>i.ok).length,0);

 $("achGrid").innerHTML=groups.map(g=>
  '<div class="ach-group"><h4>'+g.icon+" "+nm(g)+
   ' <span class="ach-count">'+g.items.filter(i=>i.ok).length+"/"+g.items.length+"</span></h4>"+
  g.items.map(i=>{
   /* 진행도가 있으면 막대로, 기록형이면 현재 최고값을 보여 준다 */
   const bar=(i.goal!=null&&!i.ok)
    ? '<div class="ach-bar"><i style="width:'+Math.round(i.now/i.goal*100)+'%"></i></div>'
      +'<span class="ach-sub">'+i.now+" / "+i.goal+"</span>"
    : (i.note?'<span class="ach-sub">'+i.note+(i.cur!=null?" · "+(cur==="ko"?"최고 ":"best ")+i.cur:"")+"</span>":"");
   return '<div class="ach-item'+(i.ok?" ok":"")+'"><span class="ach-name">'+
    (i.ok?"":"🔒 ")+nm(i)+"</span>"+bar+"</div>";
  }).join("")+"</div>").join("");

 $("achProgress").textContent=cur==="ko"
  ? `업적 ${done} / ${all} 달성 · 보유 칭호 ${got}개`
  : `${done} of ${all} unlocked · ${got} titles held`;
 $("achModal").hidden=false;
 document.body.style.overflow="hidden";
 track("achievements_open",{done,all});
}
export function closeAch(){$("achModal").hidden=true;document.body.style.overflow="";}

$("achClose").addEventListener("click",closeAch);
$("achModal").addEventListener("click",e=>{if(e.target.id==="achModal")closeAch();});
/* 칭호 자체가 목록으로 들어가는 문이다 — 따로 버튼을 만들면 첫 화면이 더 복잡해진다 */
$("titleTag").addEventListener("click",openAch);
