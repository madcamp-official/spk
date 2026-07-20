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

/* 딴 칭호의 "기준 · 내 값" 한 줄.
   단위(회·개국·종)는 그룹이 사전 키(u)로 들고 있고 여기서 t()로 푼다 — 엔진은 한국어를 모른다.
   기록·희귀도 그룹은 단위가 항목마다 달라(cm·kg·1/N…) 엔진이 문자열로 빚어 note/cur에 담아 준다. */
function howHTML(g,i){
 let s="";
 /* 1은 따로 뽑는다 — 영어·스페인어·포르투갈어는 "1 rebirths"가 되기 때문.
    첫 칭호("첫 생")의 기준이 1이라 이 자리는 영어권에서 늘 보인다. */
 const u=n=>t(n===1&&g.u1?g.u1:g.u,{n});
 if(g.u&&i.goal!=null&&i.cur!=null)
  /* 기준과 내 값이 같으면 한 번만 쓴다. 대륙 정복은 "전부 모으기"가 곧 기준이라 늘 같고,
     다른 칭호도 문턱에 딱 걸치면 같아진다 — "기준 12개국 · 지금 12개국"은 말이 겹친다. */
  s=i.cur===i.goal?t("{a} 달성",{a:u(i.goal)})
                  :t("기준 {a} · 지금 {b}",{a:u(i.goal),b:u(i.cur)});
 else if(i.note&&i.cur!=null)
  s=t("기준 {a} · 내 기록 {b}",{a:i.note,b:i.cur});
 return s?'<span class="ach-how">'+s+"</span>":"";
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
     : (i.note&&!i.ok?'<span class="ach-sub">'+i.note+"</span>":"");
    /* 딴 칭호는 기준 대신 "그 기준을 어떻게 넘겼나"를 품는다(hover 때만 드러난다).
       기준만 다시 보여주면 이미 딴 사람에겐 새 정보가 없다. */
    const how=i.ok?howHTML(g,i):"";
    return '<div class="ach-item'+(i.ok?" ok":"")+'"'+(how?' tabindex="0"':"")+
     '><span class="ach-name">'+(i.ok?"":"🔒 ")+tname(i)+"</span>"+bar+how+"</div>";
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
