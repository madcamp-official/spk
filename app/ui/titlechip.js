import {$} from "../core/util.js";
import {t,contName} from "../i18n/i18n.js";
import {topTitle,nextGoal,dexProgress,catalog} from "../engine/titles.js";

/* 칭호의 표시 담당. engine/titles.js 는 한국어 사전 키(k)만 돌려주므로 여기서 t()로 푼다.
   대륙 칭호는 "{cont} 정복자" 템플릿이라 contName()으로 대륙 이름을 채운다 —
   그래야 "アジアの征服者"처럼 6개 언어가 전부 자연스럽게 나온다. */
export const tname=x=>!x?"":(x.cont?t(x.k,{cont:contName(x.cont)}):t(x.k));

/* 대표 칭호를 헤더의 정체성 줄(생 번호 옆)에 그린다.
   hero의 배지 행이 아니라 여기인 이유: 칭호는 누적 성취고 배지는 이번 생 한 판짜리라
   나란히 두면 같은 종류로 읽힌다. 기존 줄에 얹으므로 모바일 한 화면 제약도 안 건드린다. */
export function paintTitle(){
 const el=$("titleTag"); if(!el)return;
 const x=topTitle();
 el.textContent=x?x.icon+" "+tname(x):"";
 el.hidden=!x;
}

/* 공유 카드와 공유 문구가 함께 쓰는 한 줄 — "🏅 삼사라 중독자 · 47개국 수집".
   두 곳이 각자 문구를 만들면 조용히 어긋나므로 여기 하나만 둔다. 칭호가 없으면 빈 문자열. */
export function titleLine(){
 const x=topTitle();
 return x?x.icon+" "+tname(x)+" · "+t("{n}개국 수집",{n:dexProgress().owned}):"";
}

/* 도감 진행률 바 + 다음 목표. 숫자만 두면 "얼마나 남았는지"가 안 읽힌다. */
export function paintProgress(){
 const p=dexProgress(), fill=$("dexBarFill"), goal=$("dexGoal");
 if(fill)fill.style.width=p.pct+"%";
 if(!goal)return;
 const g=nextGoal();
 goal.textContent=g?g.icon+" "+t("{title}까지 {n}",{title:tname(g),n:g.goal-g.now}):"";
}

/* 업적 타일 — 도감 타일과 같은 모양으로 세워 "여기도 열린다"는 걸 알아채게 한다.
   숫자(달성/전체) + 진행 막대 + 지금 대표 칭호. 대표 칭호를 같이 보여주는 이유는
   칭호가 무엇인지 한 줄로 설명되기 때문이다. */
export function paintAch(){
 const el=$("stAch"); if(!el)return;
 const gs=catalog();
 const all=gs.reduce((n,g)=>n+g.items.length,0);
 const done=gs.reduce((n,g)=>n+g.items.filter(i=>i.ok).length,0);
 el.textContent=done+"/"+all;
 const fill=$("achBarFill"); if(fill)fill.style.width=Math.round(done/all*100)+"%";
 const top=$("achTop"), x=topTitle();
 if(top)top.textContent=x?x.icon+" "+tname(x):"";
}
