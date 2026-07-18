import {$} from "../core/util.js";
import {ST,persist,session} from "../core/state.js";
import {track} from "../track.js";
import {toast} from "./effects.js";
import {t} from "../i18n/i18n.js";

/* ===== 한 줄 제안 (직접 의견 수집 통로) =====
   정적 페이지라 서버가 없다. track()으로 분석 도구에 실어 보내고, 스니펫이 아직
   없을 때를 대비해 localStorage에도 남긴다(스니펫 연결 전까지는 팀이 읽을 수 없음). */
$("suggest").addEventListener("submit",e=>{
 e.preventDefault();
 const inp=$("sgInput"),text=inp.value.trim();
 if(!text)return;
 ST.suggests=(ST.suggests||[]).concat([{t:text,at:Date.now()}]).slice(-20);
 track("suggest",{text,country:session.currentLife?session.currentLife.c.name:"none"});
 persist();
 inp.value="";inp.blur();
 toast(t("제안 고마워요! 다음 개선 후보로 담아 둘게요 📝"));
});
