import {$} from "../core/util.js";
import {t,term,countryName} from "../i18n/i18n.js";
import {catalog,earned,records,REL_ALL,ETH_ALL} from "../engine/titles.js";
import {tname} from "./titlechip.js";
import {relSet,ethSet} from "../core/state.js";
import {track} from "../analytics/track.js";

/* ===== 업적 · 수집 =====
   탭으로 축을 나눈다. 개수만 보여주면("종교 10종 수집") 정작 뭘 모았는지를 모른다 —
   나라 도감처럼 목록을 보여줘야 "뭐가 남았나"가 읽히고 그게 다음 목표가 된다.
   수집 목록은 나라 도감과 같은 .dex-item 스타일을 그대로 쓴다(같은 것은 같아 보여야 한다).
   문구는 전부 i18n의 STR을 탄다 — 여기에 한국어를 직접 박지 않는다. */
const TABS=[
 {id:"title",icon:"🏅",k:"칭호"},
 {id:"rec",  icon:"🏆",k:"기록"},
 {id:"rel",  icon:"🙏",k:"종교"},
 {id:"eth",  icon:"🧬",k:"민족"},
];
let active="title";

/* 수집 목록 한 칸 — 모은 것은 밝게(owned), 안 모은 것은 흐리게 */
function collectionHTML(all,got){
 return '<div class="dex-grid">'+all.map(n=>
  '<div class="dex-item'+(got.has(n)?" owned":"")+'"><span class="dex-name">'+
  (got.has(n)?"":"🔒 ")+term(n)+"</span></div>").join("")+"</div>";
}

function body(){
 if(active==="title"){
  return catalog().map(g=>
   '<div class="ach-group"><h4>'+g.icon+" "+t(g.k)+
    ' <span class="ach-count">'+g.items.filter(i=>i.ok).length+"/"+g.items.length+"</span></h4>"+
   g.items.map(i=>{
    const bar=(i.goal!=null&&!i.ok)
     ? '<div class="ach-bar"><i style="width:'+Math.round(i.now/i.goal*100)+'%"></i></div>'
       +'<span class="ach-sub">'+i.now+" / "+i.goal+"</span>"
     : (i.note?'<span class="ach-sub">'+i.note+"</span>":"");
    return '<div class="ach-item'+(i.ok?" ok":"")+'"><span class="ach-name">'+
     (i.ok?"":"🔒 ")+tname(i)+"</span>"+bar+"</div>";
   }).join("")+"</div>").join("");
 }
 if(active==="rec"){
  return '<div class="rec-list">'+records().map(r=>{
   let val;
   if(r.country)val=countryName(r.country)+(r.note?' <span class="ach-sub">'+r.note+"</span>":"");
   else if(r.v==null)val='<span class="rec-none">'+t("아직 없음")+"</span>";
   else if(r.rank)val=t("상위 {v}%",{v:r.v});
   else val=r.unit==="yr"?t("{n}세",{n:r.v}):r.v+r.unit;
   return '<div class="rec-row"><span class="rec-k">'+r.icon+" "+t(r.k)+
    '</span><span class="rec-v">'+val+"</span></div>";
  }).join("")+"</div>";
 }
 if(active==="rel")return collectionHTML(REL_ALL,relSet);
 return collectionHTML(ETH_ALL,ethSet);
}

function head(){
 if(active==="rel")return t("겪어 본 종교 {a} / {b}",{a:relSet.size,b:REL_ALL.length});
 if(active==="eth")return t("겪어 본 민족 {a} / {b}",{a:ethSet.size,b:ETH_ALL.length});
 if(active==="rec")return t("지금까지의 최고 기록");
 const gs=catalog(), all=gs.reduce((n,g)=>n+g.items.length,0),
       done=gs.reduce((n,g)=>n+g.items.filter(i=>i.ok).length,0);
 return t("업적 {done} / {all} 달성 · 보유 칭호 {n}개",{done,all,n:earned().length});
}

function paint(){
 $("achTabs").innerHTML=TABS.map(x=>
  '<button class="ach-tab'+(x.id===active?" on":"")+'" data-tab="'+x.id+'">'+
  x.icon+" "+t(x.k)+"</button>").join("");
 $("achProgress").textContent=head();
 /* 칭호 탭만 2열 — 기록·수집은 한 덩어리라 2열이면 오른쪽이 빈다 */
 $("achGrid").className="ach-grid"+(active==="title"?" cols":"");
 $("achGrid").innerHTML=body();
 $("achGrid").scrollTop=0;
}

export function openAch(tab){
 if(tab)active=tab;
 paint();
 $("achModal").hidden=false;
 document.body.style.overflow="hidden";
 track("achievements_open",{tab:active});
}
export function closeAch(){$("achModal").hidden=true;document.body.style.overflow="";}

$("achClose").addEventListener("click",closeAch);
$("achModal").addEventListener("click",e=>{if(e.target.id==="achModal")closeAch();});
$("achTabs").addEventListener("click",e=>{
 const b=e.target.closest("[data-tab]");if(!b)return;
 active=b.dataset.tab;paint();track("achievements_tab",{tab:active});
});
/* 칭호 자체가 목록으로 들어가는 문이다 — 따로 버튼을 만들면 첫 화면이 더 복잡해진다 */
$("titleTag").addEventListener("click",()=>openAch("title"));
$("achBtn").addEventListener("click",()=>openAch("title"));
