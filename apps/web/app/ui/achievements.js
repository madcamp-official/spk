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

/* 기록·희귀도 칭호의 hover 보충. 상시 줄(sub)은 조건만 보여준다 — 기록형은 "≥130",
   희귀도는 "1/10,000". 딴 뒤엔 hover로 내 실제 기록(143 · 1/737,104)까지 보탠다.
   tier·대륙 정복은 상시 줄이 "now / goal"이라 내 값이 이미 들어 있어 여기서 다루지 않는다.
   note/cur 문자열은 엔진이 언어중립으로 빚어 준다(단위가 cm·kg·1/N로 제각각이라). */
function howHTML(i){
 /* 조건(note)은 sub가 이미 상시 보여준다 — 반복하면 "≥130"이 두 번 뜬다.
    hover는 sub가 못 담는 것, 내 실제 기록만 보탠다. */
 if(!i.ok||!i.note||i.cur==null||i.cur===i.note)return "";
 return '<span class="ach-how">'+t("내 기록 {b}",{b:i.cur})+"</span>";
}

function body(){
 if(active==="title"){
  return catalog().map(g=>
   '<div class="ach-group"><h4>'+g.icon+" "+t(g.k)+
    ' <span class="ach-count">'+g.items.filter(i=>i.ok).length+"/"+g.items.length+"</span></h4>"+
   g.items.map(i=>{
    /* 달성 조건은 딴 뒤에도 늘 보이게 둔다(seojinnlee) — goal이면 진행도 now/goal,
       아니면 note(≥130·1/10,000). 예전엔 딴 마일스톤이 조건을 통째로 감춰
       "몇 회짜리였는지"가 사라졌다. 진행 막대만 아직 못 딴 것에 남긴다. */
    const sub=i.goal!=null
     ? '<span class="ach-sub">'+i.now+" / "+i.goal+"</span>"
     : (i.note?'<span class="ach-sub">'+i.note+"</span>":"");
    const bar=(i.goal!=null&&!i.ok)
     ? '<div class="ach-bar"><i style="width:'+Math.round(i.now/i.goal*100)+'%"></i></div>'
     : "";
    /* 기록·희귀도는 딴 뒤 hover로 내 실제 기록을 보탠다(howHTML 참조) */
    const how=howHTML(i);
    return '<div class="ach-item'+(i.ok?" ok":"")+'"'+(how?' tabindex="0"':"")+
     '><span class="ach-name">'+(i.ok?"":"🔒 ")+tname(i)+"</span>"+bar+sub+how+"</div>";
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
