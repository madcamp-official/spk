import {$} from "../core/util.js";
import {cur,t} from "../i18n/i18n.js";
import {topTitle,nextGoal,dexProgress} from "../engine/titles.js";

/* 칭호의 표시 담당. engine/titles.js 는 순수 로직이라 언어를 모르므로,
   {ko,en} 중 무엇을 쓸지는 여기(ui 층)서 정한다.
   ⚠ 실험 단계라 ko/en 두 벌뿐이다 — ja/zh/es/pt 는 영어로 떨어진다. */
export const tname=x=>x?(cur==="ko"?x.ko:x.en):"";

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

/* 도감 진행률 바 + 다음 목표. 진행률 시각화 자체가 리텐션 장치라 숫자만 두지 않는다. */
export function paintProgress(){
 const p=dexProgress(), fill=$("dexBarFill"), goal=$("dexGoal");
 if(fill)fill.style.width=p.pct+"%";
 if(!goal)return;
 const g=nextGoal();
 goal.textContent=g
  ?(cur==="ko"
     ? `${g.icon} ${tname(g)}까지 ${g.goal-g.now}`
     : `${g.icon} ${g.goal-g.now} to ${tname(g)}`)
  :"";
}
