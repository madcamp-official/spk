#!/usr/bin/env bash
#
# life-reroll.madcamp-kaist.org 배포 스크립트 (캠프 VM camp-15 전용)
#
#   sudo ./deploy.sh          레포 작업트리를 그대로 배포
#   sudo ./deploy.sh --pull   git pull 먼저 하고 배포
#   sudo ./deploy.sh --check   배포하지 않고 현재 상태만 점검
#
# nginx는 레포가 아니라 /var/www/life-reroll 에서 서빙하므로 git pull만으로는
# 라이브에 반영되지 않는다. 이 스크립트가 그 복사와 검증을 담당한다.

set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WWW=/var/www/life-reroll
COUNTER_SRC=server/counter.js
COUNTER_DST=/opt/life-reroll/counter.js
SERVICE=life-reroll-counter
HOST=life-reroll.madcamp-kaist.org
LOCAL=http://127.0.0.1:1557
LIVE=https://$HOST
# 루트 파일 + css/ js/ 아래 전부. 모듈은 하나라도 빠지면 앱이 통째로 죽으므로
# 목록을 손으로 관리하지 않고 레포에 있는 것을 그대로 훑는다.
mapfile -t ASSETS < <(
  cd "$REPO" || exit 1
  printf '%s\n' index.html og-image.png TwemojiCountryFlags.woff2
  find css js -type f \( -name '*.css' -o -name '*.js' \) | sort
)

PULL=0
CHECK_ONLY=0
for arg in "${@:-}"; do
  case "$arg" in
    --pull)  PULL=1 ;;
    --check) CHECK_ONLY=1 ;;
    -h|--help) sed -n '2,10p' "${BASH_SOURCE[0]}" | sed 's/^# \?//'; exit 0 ;;
    "") ;;
    *) echo "알 수 없는 옵션: $arg (--pull, --check, --help)" >&2; exit 1 ;;
  esac
done

if [ "$CHECK_ONLY" -eq 0 ] && [ "$(id -u)" -ne 0 ]; then
  echo "root 권한이 필요합니다:  sudo $0 $*" >&2
  exit 1
fi

fail=0
say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
ok()  { printf '  \033[32m✔\033[0m %s\n' "$*"; }
chg() { printf '  \033[33m↑\033[0m %s\n' "$*"; }
bad() { printf '  \033[31m✘\033[0m %s\n' "$*"; fail=1; }

# ── 1. 소스 최신화 ────────────────────────────────────────────────
if [ "$PULL" -eq 1 ]; then
  say "1. git pull"
  git -C "$REPO" pull --ff-only
else
  say "1. 소스 (pull 생략, --pull 로 켤 수 있음)"
fi
printf '  HEAD %s  %s\n' "$(git -C "$REPO" rev-parse --short HEAD)" "$(git -C "$REPO" log -1 --format=%s)"
if [ -n "$(git -C "$REPO" status --porcelain)" ]; then
  printf '  \033[33m⚠\033[0m 커밋되지 않은 변경이 있습니다. 작업트리 상태 그대로 배포합니다.\n'
fi

# ── 2. 정적 파일 ─────────────────────────────────────────────────
say "2. 정적 파일 → $WWW"
for f in "${ASSETS[@]}"; do
  [ -f "$REPO/$f" ] || { bad "$f 가 레포에 없습니다"; exit 1; }
done

if [ "$CHECK_ONLY" -eq 1 ]; then
  for f in "${ASSETS[@]}"; do
    cmp -s "$REPO/$f" "$WWW/$f" 2>/dev/null && ok "$f 동일" || bad "$f 배포본과 다름 (배포 필요)"
  done
else
  install -d -o www-data -g www-data "$WWW"
  same=0
  for f in "${ASSETS[@]}"; do
    if cmp -s "$REPO/$f" "$WWW/$f" 2>/dev/null; then
      same=$((same+1))
    else
      install -D -m 644 -o www-data -g www-data "$REPO/$f" "$WWW/$f"
      chg "$f 갱신"
    fi
  done
  [ "$same" -gt 0 ] && ok "$same개 파일 변경 없음"
fi

# ── 3. 카운터 서버 ───────────────────────────────────────────────
# 소스가 그대로면 재시작하지 않는다. 재시작해도 값은 보존되지만(디스크에 저장),
# 굳이 끊을 이유가 없다.
say "3. 카운터 서버"
if [ "$CHECK_ONLY" -eq 1 ]; then
  cmp -s "$REPO/$COUNTER_SRC" "$COUNTER_DST" 2>/dev/null && ok "counter.js 동일" || bad "counter.js 배포본과 다름"
elif cmp -s "$REPO/$COUNTER_SRC" "$COUNTER_DST" 2>/dev/null; then
  ok "counter.js 변경 없음 → 재시작 생략 (무중단)"
else
  install -D -m 644 "$REPO/$COUNTER_SRC" "$COUNTER_DST"
  systemctl restart "$SERVICE"
  chg "counter.js 갱신 → $SERVICE 재시작"
fi

# ── 4. 서비스 상태 ───────────────────────────────────────────────
say "4. 서비스"
for s in nginx "$SERVICE" cloudflared; do
  a=$(systemctl is-active "$s" 2>/dev/null || true)
  e=$(systemctl is-enabled "$s" 2>/dev/null || true)
  if [ "$a" = active ] && [ "$e" = enabled ]; then
    ok "$(printf '%-20s %s / %s' "$s" "$a" "$e")"
  else
    bad "$(printf '%-20s %s / %s' "$s" "$a" "$e")  ← 확인 필요"
  fi
done

# ── 5. 배포 검증 ─────────────────────────────────────────────────
# 로컬(nginx 직접) → 라이브(터널 경유) 순으로 확인해 문제 지점을 좁힌다.
say "5. 검증"

local_code=$(curl -s -o /dev/null -w '%{http_code}' -H "Host: $HOST" "$LOCAL/" || echo 000)
[ "$local_code" = 200 ] && ok "로컬 nginx        HTTP $local_code" || bad "로컬 nginx        HTTP $local_code"

live_size=$(curl -s -o /dev/null -w '%{size_download}' --max-time 25 "$LIVE/" || echo 0)
live_code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 25 "$LIVE/" || echo 000)
want=$(stat -c%s "$REPO/index.html")
if [ "$live_code" = 200 ] && [ "$live_size" = "$want" ]; then
  ok "라이브 index.html HTTP $live_code · ${live_size}B (레포와 일치)"
else
  bad "라이브 index.html HTTP $live_code · ${live_size}B (레포는 ${want}B)"
fi

font_code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 25 "$LIVE/TwemojiCountryFlags.woff2" || echo 000)
[ "$font_code" = 200 ] && ok "라이브 국기 폰트   HTTP $font_code" || { bad "라이브 국기 폰트   HTTP $font_code"; }

# index.html이 200이어도 모듈이 하나 빠지면 앱은 통째로 죽는다. css·js를 전부 확인한다.
# 반드시 로컬 nginx(오리진)로 본다 — 배포가 제대로 됐는지는 오리진이 답이고,
# 라이브로 찌르면 아직 없는 파일의 응답을 Cloudflare가 캐시해 버려 오히려 사고가 난다.
missing=""
n=0
for f in $(cd "$REPO" && find css js -type f \( -name '*.css' -o -name '*.js' \) | sort); do
  n=$((n+1))
  ct=$(curl -s -o /dev/null -w '%{content_type}' -H "Host: $HOST" "$LOCAL/$f" || echo "?")
  case "$f:$ct" in
    *.css:text/css*|*.js:*javascript*) ;;
    *) missing="$missing $f($ct)" ;;
  esac
done
if [ -z "$missing" ]; then
  ok "오리진 css·js      ${n}개 모두 정상 타입"
else
  bad "오리진 css·js      잘못된 응답:$missing"
fi

api=$(curl -s --max-time 20 "$LIVE/api/counter" || true)
if printf '%s' "$api" | grep -q '"total"'; then
  ok "카운터 API        $api"
else
  bad "카운터 API        응답 없음/이상: ${api:-（빈 응답）}"
fi

say "결과"
if [ "$fail" -ne 0 ]; then
  printf '  \033[31m문제가 있습니다. 위 ✘ 항목을 확인하세요.\033[0m\n\n' >&2
  exit 1
elif [ "$CHECK_ONLY" -eq 1 ]; then
  printf '  \033[32m점검만 했습니다 (아무것도 바꾸지 않음) — %s 정상\033[0m\n\n' "$LIVE"
else
  printf '  \033[32m배포 완료 — %s 정상\033[0m\n\n' "$LIVE"
fi
