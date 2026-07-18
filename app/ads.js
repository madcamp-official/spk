/* ===== 광고 (Google AdSense) =====
 * 게시자 ID를 넣기 전까지는 아무것도 하지 않는다. 슬롯도 감춘 채로 두고, 외부 스크립트도
 * 부르지 않는다 — 그래서 승인 전/미설정 상태에서 리롤 체감이나 레이아웃이 전혀 바뀌지 않는다.
 *
 * 켜는 법 (애드센스 승인 후):
 *   1) 아래 ADSENSE_CLIENT 에 게시자 ID를 넣는다.  예: "ca-pub-1234567890123456"
 *   2) ADSENSE_SLOT 에 광고 단위 슬롯 ID를 넣는다.  예: "1234567890"
 *   3) ads.txt 의 pub 번호도 같은 값으로 바꾼다 (레포 루트의 ads.txt).
 * 두 값 중 하나라도 비어 있으면 광고는 완전히 꺼진 것으로 본다.
 */
import {$} from "./util.js";

const ADSENSE_CLIENT = "";   // "ca-pub-..." 게시자 ID
const ADSENSE_SLOT   = "";   // "..........." 광고 단위 슬롯 ID

const slot = $("adSlot");

/* 미설정이면 흔적 없이 제거한다. 빈 회색칸조차 남기지 않는다. */
if (!ADSENSE_CLIENT || !ADSENSE_SLOT || !slot) {
  if (slot) slot.remove();
} else {
  const ins = slot.querySelector("ins.adsbygoogle");
  ins.setAttribute("data-ad-client", ADSENSE_CLIENT);
  ins.setAttribute("data-ad-slot", ADSENSE_SLOT);
  /* 슬롯을 hidden으로 두면 크기가 0이라 IntersectionObserver가 영영 발화하지 않는다
     (관측이 로드를 트리거하는데, 로드돼야 hidden을 푸는 교착). 그래서 처음부터 보이되
     로더가 실제로 광고를 채우기 전까지는 라벨 높이만 있는 얇은 자리로 둔다. */
  slot.hidden = false;

  /* AdSense 로더는 크리티컬 패스 밖에서 부른다 — 리롤이 다 준비된 뒤(load 이후) +
     사용자가 실제로 광고 근처까지 스크롤했을 때만. 첫 화면 리롤 반응성을 지킨다.
     이 페이지는 애초에 광고가 화면 밖이라, 스크롤하지 않는 세션엔 로더조차 안 뜬다. */
  let loaded = false;
  function load() {
    if (loaded) return;
    loaded = true;
    const s = document.createElement("script");
    s.async = true;
    s.crossOrigin = "anonymous";
    s.src = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=" + ADSENSE_CLIENT;
    s.onload = () => {
      slot.hidden = false;
      try { (window.adsbygoogle = window.adsbygoogle || []).push({}); } catch (_) {}
    };
    s.onerror = () => { slot.remove(); };   /* 애드블록 등으로 못 불러오면 자리도 없앤다 */
    document.head.appendChild(s);
  }

  /* 모듈은 defer라 window load 이후에 실행될 수 있다. 그때는 addEventListener("load")가
     영영 안 불리므로, 이미 로드가 끝났으면 즉시 시작한다. */
  function whenLoaded(fn) {
    if (document.readyState === "complete") fn();
    else addEventListener("load", fn);
  }
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((es) => {
      if (es.some(e => e.isIntersecting)) { io.disconnect(); load(); }
    }, { rootMargin: "300px" });   /* 근처에 오면 미리 */
    whenLoaded(() => io.observe(slot));
  } else {
    whenLoaded(load);
  }
}
