#!/usr/bin/env bash
#
# 실험판(lab) 워크플로 — 배포 전에 실험판을 띄우고, 보고 나서 채택/폐기한다.
#
#   sudo ./lab.sh new <이름>   실험 시작 (lab 브랜치를 main 최신으로 리셋)
#   sudo ./lab.sh up           실험판 빌드·배포 → https://life-reroll.com/lab/
#        ./lab.sh status       프로덕션 대비 무엇이 달라졌는지
#   sudo ./lab.sh adopt        채택: lab → main 머지 + 프로덕션 배포 + 실험판 초기화
#   sudo ./lab.sh discard      폐기: 실험 내용 버리고 실험판을 프로덕션 상태로 되돌림
#
# 구조
#   /root/spk       main 브랜치 = 프로덕션 소스 (실험 중에도 절대 안 건드림)
#   /root/spk-lab   lab 브랜치 = 실험 작업 공간 (git worktree). 여기서 코드를 고친다.
#   /var/www/life-reroll/lab/   실험판이 서빙되는 곳
#
# 격리 — 실험이 프로덕션 데이터를 오염시킬 수 없다. 빌드할 때 실험판 사본만 고쳐서 만든다.
#   localStorage : rebirth_* → lab_rebirth_*   (실제 도감·환생 횟수와 분리)
#   API          : /api/ → /lab-api/           (포트 1559의 별도 인스턴스, 데이터·서명키 분리)
#   base href    : / → /lab/                   (상대 자산이 실험판 안에서 풀리도록)
#   검색엔진      : noindex, no-store

set -euo pipefail

REPO=/root/spk
LAB_SRC=/root/spk-lab
LAB_WWW=/var/www/life-reroll/lab
LAB_OPT=/opt/life-reroll-lab
LAB_SVC=life-reroll-counter-lab
LAB_STATE=/var/lib/life-reroll-lab
LAB_URL=https://life-reroll.com/lab/

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
ok()  { printf '  \033[32m✔\033[0m %s\n' "$*"; }
chg() { printf '  \033[33m↑\033[0m %s\n' "$*"; }
bad() { printf '  \033[31m✘\033[0m %s\n' "$*"; }
die() { printf '\n\033[31m%s\033[0m\n\n' "$*" >&2; exit 1; }

need_root() { [ "$(id -u)" -eq 0 ] || die "root 권한이 필요합니다:  sudo $0 $*"; }
lab_name()  { cat "$LAB_STATE/name.txt" 2>/dev/null || echo "(이름 없음)"; }
dirty()     { [ -n "$(git -C "$1" status --porcelain)" ]; }

# ── 실험판 빌드 ───────────────────────────────────────────────────
# 소스는 그대로 두고, 배포되는 사본에만 격리 치환을 건다.
# 이렇게 하면 채택할 때 lab 전용 코드가 main으로 새어 들어가지 않는다.
build() {
  local tmp="$LAB_WWW.tmp"
  rm -rf "$tmp"; install -d "$tmp"

  ( cd "$LAB_SRC"
    # shellcheck disable=SC2046
    cp --parents index.html TwemojiCountryFlags.woff2 \
       $(find css app -type f \( -name '*.css' -o -name '*.js' \)) "$tmp/" )

  # 1) 자산 기준 경로를 실험판 안으로
  sed -i 's|<base href="/">|<base href="/lab/">|' "$tmp/index.html"

  # 2) 저장소 격리 — 실제 진행상황(도감·환생 횟수)과 절대 섞이면 안 된다
  find "$tmp" -type f \( -name '*.js' -o -name '*.html' \) -print0 \
    | xargs -0 sed -i -e 's/"rebirth_state"/"lab_rebirth_state"/g' \
                      -e 's/"rebirth_lang"/"lab_rebirth_lang"/g'

  # 3) API 격리 — 전역 카운터·이벤트·공유가 프로덕션에 안 쌓이도록
  find "$tmp/app" -type f -name '*.js' -print0 \
    | xargs -0 sed -i 's|"/api/|"/lab-api/|g'

  # 4) 실험판 표식 + 검색엔진 차단 + 테스트 데이터 시드
  #    시드: /lab/?seed=47&total=200 처럼 열면 도감 47개국·환생 200회 상태로 시작한다.
  #    칭호·진행률 같은 기능은 빈 상태로는 평가가 안 되기 때문에 필요하다.
  python3 - "$tmp/index.html" <<'PY'
import io, sys
p = sys.argv[1]
s = io.open(p, encoding="utf-8").read()
s = s.replace('<base href="/lab/">', '<base href="/lab/">\n<meta name="robots" content="noindex, nofollow">', 1)
seed = '''
<script>
/* 실험판 전용: ?seed=<도감 국가수>&total=<환생 횟수> 로 평가용 상태를 즉석에서 만든다.
   앱 모듈이 localStorage를 읽기 전에 돌아야 하므로 head에서 동기 실행. */
(function(){try{
  var q=new URLSearchParams(location.search); if(!q.has("seed")&&!q.has("total"))return;
  var n=Math.max(0,Math.min(198,parseInt(q.get("seed")||"0",10)||0));
  var total=parseInt(q.get("total")||String(n),10)||n;
  var idx=[],i; for(i=0;i<198;i++)idx.push(i);
  for(i=idx.length-1;i>0;i--){var j=(i*2654435761)%(i+1),t=idx[i];idx[i]=idx[j];idx[j]=t;}
  localStorage.setItem("lab_rebirth_state",JSON.stringify({
    total:total, seen:idx.slice(0,n), best:{name:"모나코",prob:0.0000048},
    dev:null, fortuneDay:null, metrics:{}, suggests:[]}));
}catch(e){}})();
</script>'''
s = s.replace('</head>', seed + '\n</head>', 1)
badge = '''
<div id="labBadge">실험판 LAB</div>
<style>#labBadge{position:fixed;left:8px;bottom:8px;z-index:99999;background:#ff8fb2;color:#0a0d1c;
 font:700 11px/1 system-ui,sans-serif;padding:6px 10px;border-radius:999px;opacity:.92;pointer-events:none}</style>'''
s = s.replace('</body>', badge + '\n</body>', 1)
io.open(p, "w", encoding="utf-8").write(s)
PY

  chown -R www-data:www-data "$tmp"
  rm -rf "$LAB_WWW"; mv "$tmp" "$LAB_WWW"

  # 서버(roll 서명·카운터)도 실험판 코드로 — APP_JS_DIR이 실험판 app을 가리키므로 재시작해야 반영된다
  install -D -m 644 "$LAB_SRC/server/counter.js" "$LAB_OPT/counter.js"
  systemctl enable --now "$LAB_SVC" >/dev/null 2>&1 || true
  systemctl restart "$LAB_SVC"
}

verify() {
  local fail=0
  # 카운터는 재시작 뒤 뽑기 모듈을 로드하느라 몇 초 걸린다. 고정 sleep 은 레이스가 나므로
  # 준비될 때까지 기다린다(최대 20초).
  local i
  for i in $(seq 1 40); do
    curl -s --max-time 2 -H "Host: life-reroll.com" http://127.0.0.1:1557/lab-api/counter 2>/dev/null | grep -q '"total"' && break
    sleep 0.5
  done
  local code; code=$(curl -s -o /dev/null -w '%{http_code}' -H "Host: life-reroll.com" http://127.0.0.1:1557/lab/ || echo 000)
  [ "$code" = 200 ] && ok "실험판 페이지     HTTP $code" || { bad "실험판 페이지 HTTP $code"; fail=1; }

  # 모듈이 하나라도 빠지면 앱이 통째로 죽는다 — 전부 확인
  local miss="" n=0 ct
  for f in $(cd "$LAB_WWW" && find css app -type f \( -name '*.css' -o -name '*.js' \) | sort); do
    n=$((n+1))
    ct=$(curl -s -o /dev/null -w '%{content_type}' -H "Host: life-reroll.com" "http://127.0.0.1:1557/lab/$f" || echo '?')
    case "$f:$ct" in *.css:text/css*|*.js:*javascript*) ;; *) miss="$miss $f($ct)" ;; esac
  done
  [ -z "$miss" ] && ok "실험판 css·js     ${n}개 정상" || { bad "빠진 자산:$miss"; fail=1; }

  local api; api=$(curl -s --max-time 10 -H "Host: life-reroll.com" http://127.0.0.1:1557/lab-api/counter || true)
  printf '%s' "$api" | grep -q '"total"' && ok "실험판 API        $api (프로덕션과 별도)" || { bad "실험판 API 응답 없음: ${api:-비어있음}"; fail=1; }

  # 격리가 실제로 걸렸는지 — 여기가 뚫리면 실험이 프로덕션 데이터를 건드린다
  grep -q 'lab_rebirth_state' "$LAB_WWW/app/core/state.js" && ok "저장소 격리       lab_rebirth_*" || { bad "저장소 격리 안 됨"; fail=1; }
  grep -q '"/lab-api/' "$LAB_WWW/app/ui/counter.js" && ok "API 격리          /lab-api/" || { bad "API 격리 안 됨"; fail=1; }
  ! grep -q '"/api/' "$LAB_WWW/app/ui/counter.js" && ok "프로덕션 API 참조 없음" || { bad "프로덕션 /api/ 참조가 남음"; fail=1; }
  return $fail
}

cmd=${1:-}; shift || true
case "$cmd" in

new)
  need_root "$@"
  name=${1:-}; [ -n "$name" ] || die "실험 이름을 주세요:  sudo $0 new 칭호시스템"
  dirty "$LAB_SRC" && die "실험판에 저장 안 된 변경이 있습니다. 먼저 adopt 하거나 discard 하세요."
  git -C "$LAB_SRC" reset --hard main >/dev/null
  git -C "$LAB_SRC" clean -fd >/dev/null
  install -d "$LAB_STATE"; echo "$name" > "$LAB_STATE/name.txt"
  say "실험 시작: $name"
  ok "작업 공간  $LAB_SRC  (여기서 코드를 고치세요 — main은 안 건드립니다)"
  ok "다음       sudo $0 up   → $LAB_URL 에서 확인"
  ;;

up)
  need_root "$@"
  say "실험판 빌드 — $(lab_name)"
  build
  chg "빌드 완료 → $LAB_WWW"
  say "검증"
  if verify; then
    say "실험판 준비됨"
    printf '  \033[36m%s\033[0m\n' "$LAB_URL"
    printf '  \033[2m평가용 시드: %s?seed=47&total=200  (도감 47개국·환생 200회 상태)\033[0m\n\n' "$LAB_URL"
    printf '  보시고:  sudo %s adopt   (채택·배포)   |   sudo %s discard   (폐기)\n\n' "$0" "$0"
  else
    die "실험판에 문제가 있습니다. 위 ✘ 를 고치고 다시 up 하세요."
  fi
  ;;

status)
  say "실험: $(lab_name)"
  local_ahead=$(git -C "$LAB_SRC" rev-list --count main..lab 2>/dev/null || echo 0)
  printf '  lab 커밋 %s개 (main 대비)\n' "$local_ahead"
  if dirty "$LAB_SRC"; then printf '  \033[33m저장 안 된 변경 있음\033[0m\n'; fi
  say "프로덕션 대비 변경된 파일"
  git -C "$LAB_SRC" --no-pager diff --stat main -- . | sed 's/^/  /' || true
  git -C "$LAB_SRC" status --porcelain | sed 's/^/  (미저장) /' || true
  say "주소"
  printf '  프로덕션  https://life-reroll.com/\n  실험판    %s\n\n' "$LAB_URL"
  ;;

adopt)
  need_root "$@"
  name=$(lab_name)
  say "채택: $name"
  dirty "$REPO" && die "main 작업트리가 깨끗하지 않습니다. 먼저 정리하세요."
  if dirty "$LAB_SRC"; then
    git -C "$LAB_SRC" add -A
    git -C "$LAB_SRC" commit -q -m "실험: $name"
    chg "실험판의 미저장 변경을 커밋했습니다"
  fi
  if [ "$(git -C "$REPO" rev-list --count main..lab)" = 0 ]; then
    die "lab에 main과 다른 커밋이 없습니다 — 채택할 내용이 없습니다."
  fi
  git -C "$REPO" merge --no-ff lab -m "채택: $name" >/dev/null
  ok "main에 머지 완료"
  say "프로덕션 배포"
  "$REPO/deploy.sh"
  git -C "$LAB_SRC" reset --hard main >/dev/null
  build
  ok "실험판을 새 프로덕션 상태로 초기화했습니다"
  say "채택 완료 — 다음 실험은  sudo $0 new <이름>"
  printf '  \033[2mgit push 는 아직입니다(인증 필요). 원하면 지금 하세요.\033[0m\n\n'
  ;;

discard)
  need_root "$@"
  name=$(lab_name)
  say "폐기: $name"
  n=$(git -C "$LAB_SRC" rev-list --count main..lab 2>/dev/null || echo 0)
  git -C "$LAB_SRC" reset --hard main >/dev/null
  git -C "$LAB_SRC" clean -fd >/dev/null
  ok "실험 커밋 ${n}개와 미저장 변경을 버렸습니다 (main·프로덕션은 그대로)"
  build
  ok "실험판을 프로덕션 상태로 되돌렸습니다"
  say "폐기 완료 — 다음 실험은  sudo $0 new <이름>"
  ;;

*)
  sed -n '3,28p' "$0" | sed 's/^# \?//'
  exit 1
  ;;
esac
