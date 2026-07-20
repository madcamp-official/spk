#!/usr/bin/env bash
#
# Discord 봇 배포 (캠프 VM 전용)
#
#   sudo ./deploy-bot.sh          레포 작업트리 그대로 빌드·재시작
#   sudo ./deploy-bot.sh --pull   git pull 먼저 하고 배포
#        ./deploy-bot.sh --check  아무것도 바꾸지 않고 상태만 점검 (sudo 불필요)
#        ./deploy-bot.sh --logs   최근 로그 보기
#
# 웹(deploy.sh)과 배포 방식이 다르다. 웹은 파일을 /var/www 로 복사하면 끝이지만,
# 봇은 node_modules가 필요한 **장기 실행 프로세스**라 레포에서 그대로 돌린다.
# 그래서 이 스크립트는 "복사"가 아니라 "빌드 + 서비스 재시작"이다.
#
# 비밀값은 /etc/life-reroll-bot.env 에 있다(레포에 없음). 처음 한 번은 아래처럼 만든다:
#
#   sudo install -m 600 /dev/null /etc/life-reroll-bot.env
#   sudo nano /etc/life-reroll-bot.env
#     DISCORD_TOKEN=...
#     DISCORD_APP_ID=...
#     DEV_GUILD_ID=            # 운영에서는 비운다(전역 커맨드)
#     DATABASE_URL=postgresql://...
#     PGSSLMODE=require
#     ROLL_DAY_TZ=Asia/Seoul
#     # UNLIMITED_ROLLS 는 절대 넣지 않는다 — 테스트 전용이다

set -euo pipefail

MONO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BOT_DIR="$MONO/apps/bot"
SERVICE=life-reroll-bot
UNIT_SRC="$BOT_DIR/$SERVICE.service"
UNIT_DST="/etc/systemd/system/$SERVICE.service"
ENV_FILE=/etc/life-reroll-bot.env

say() { printf '\n\033[1m%s\033[0m\n' "$*"; }
ok()  { printf '  \033[32m✔\033[0m %s\n' "$*"; }
chg() { printf '  \033[33m↑\033[0m %s\n' "$*"; }
bad() { printf '  \033[31m✘\033[0m %s\n' "$*"; fail=1; }
die() { printf '\n\033[31m%s\033[0m\n\n' "$*" >&2; exit 1; }

PULL=0; CHECK_ONLY=0; LOGS=0
for arg in "${@:-}"; do
  case "$arg" in
    --pull)  PULL=1 ;;
    --check) CHECK_ONLY=1 ;;
    --logs)  LOGS=1 ;;
    -h|--help) sed -n '2,28p' "${BASH_SOURCE[0]}" | sed 's/^# \?//'; exit 0 ;;
    "") ;;
    *) die "알 수 없는 옵션: $arg (--pull, --check, --logs, --help)" ;;
  esac
done

if [ "$LOGS" -eq 1 ]; then
  exec journalctl -u "$SERVICE" -n 80 --no-pager
fi

fail=0

# ── 0. 전제 확인 ─────────────────────────────────────────────────
say "0. 전제"
command -v node >/dev/null || die "node 가 없습니다. Node 22 이상을 설치하세요."
NODE_MAJOR=$(node -p 'process.versions.node.split(".")[0]')
if [ "$NODE_MAJOR" -ge 22 ]; then ok "node $(node -v)"; else bad "node $(node -v) — 22 이상이 필요합니다"; fi
if command -v pnpm >/dev/null; then ok "pnpm $(pnpm -v)"
else bad "pnpm 이 없습니다:  npm i -g pnpm"; fi

if [ -f "$ENV_FILE" ]; then
  perm=$(stat -c '%a' "$ENV_FILE")
  [ "$perm" = 600 ] && ok "$ENV_FILE (권한 $perm)" \
    || bad "$ENV_FILE 권한이 $perm 입니다 — 토큰이 들어 있으니 600 으로:  sudo chmod 600 $ENV_FILE"
  for k in DISCORD_TOKEN DISCORD_APP_ID DATABASE_URL; do
    grep -q "^$k=." "$ENV_FILE" || bad "$ENV_FILE 에 $k 가 비어 있습니다"
  done
  # 테스트 스위치가 운영에 남는 것을 막는다 — 남으면 일일 제한이 조용히 꺼진 채로 돈다
  if grep -q '^UNLIMITED_ROLLS=1' "$ENV_FILE"; then
    bad "$ENV_FILE 에 UNLIMITED_ROLLS=1 이 있습니다 — 테스트 전용입니다. 지우세요."
  else ok "UNLIMITED_ROLLS 없음 (일일 제한 정상)"; fi
else
  bad "$ENV_FILE 이 없습니다. 이 스크립트 머리말의 안내대로 만드세요."
fi
[ "$fail" -eq 0 ] || die "전제가 갖춰지지 않았습니다. 위 ✘ 를 먼저 해결하세요."

# ── 1. 소스 ──────────────────────────────────────────────────────
if [ "$PULL" -eq 1 ]; then
  say "1. git pull"
  [ "$CHECK_ONLY" -eq 1 ] && die "--check 와 --pull 은 같이 쓸 수 없습니다."
  git -C "$MONO" pull --ff-only
else
  say "1. 소스 (pull 생략, --pull 로 켤 수 있음)"
fi
printf '  HEAD %s  %s\n' "$(git -C "$MONO" rev-parse --short HEAD)" "$(git -C "$MONO" log -1 --format=%s)"

# ── 2. 빌드 ──────────────────────────────────────────────────────
say "2. 빌드"
if [ "$CHECK_ONLY" -eq 1 ]; then
  [ -f "$BOT_DIR/dist/index.js" ] && ok "dist/index.js 존재" || bad "dist 가 없습니다 (배포 필요)"
else
  [ "$(id -u)" -eq 0 ] || die "root 권한이 필요합니다:  sudo $0 $*"
  ( cd "$MONO" && pnpm install --frozen-lockfile >/dev/null ) && ok "의존성 설치"
  ( cd "$MONO" && pnpm run build:core >/dev/null ) && ok "core 빌드"
  ( cd "$MONO" && pnpm -F @life-reroll/bot build >/dev/null ) && ok "봇 빌드"
fi

# ── 3. systemd 유닛 ──────────────────────────────────────────────
say "3. systemd"
if [ "$CHECK_ONLY" -eq 1 ]; then
  cmp -s "$UNIT_SRC" "$UNIT_DST" 2>/dev/null && ok "유닛 파일 동일" || bad "유닛 파일이 다릅니다 (배포 필요)"
else
  if cmp -s "$UNIT_SRC" "$UNIT_DST" 2>/dev/null; then
    ok "유닛 변경 없음"
  else
    install -m 644 "$UNIT_SRC" "$UNIT_DST"
    systemctl daemon-reload
    chg "유닛 갱신 → daemon-reload"
  fi
  systemctl enable "$SERVICE" >/dev/null 2>&1 || true
fi

# ── 4. 커맨드 등록 ───────────────────────────────────────────────
# 슬래시 커맨드는 코드가 아니라 Discord 쪽에 등록된 정의다 — 배포해도 저절로 갱신되지 않는다.
say "4. 슬래시 커맨드"
if [ "$CHECK_ONLY" -eq 1 ]; then
  printf '  \033[2m(점검 모드에서는 등록하지 않습니다)\033[0m\n'
else
  if ( set -a; . "$ENV_FILE"; set +a; cd "$BOT_DIR" && node dist/deploy-commands.js ); then
    ok "등록 완료"
  else
    bad "등록 실패 — 위 메시지를 확인하세요"
  fi
fi

# ── 5. 재시작 ────────────────────────────────────────────────────
say "5. 서비스"
if [ "$CHECK_ONLY" -eq 0 ]; then
  systemctl restart "$SERVICE"
  chg "$SERVICE 재시작"
  sleep 6
fi
a=$(systemctl is-active "$SERVICE" 2>/dev/null || true)
e=$(systemctl is-enabled "$SERVICE" 2>/dev/null || true)
[ "$a" = active ] && [ "$e" = enabled ] \
  && ok "$(printf '%-20s %s / %s' "$SERVICE" "$a" "$e")" \
  || bad "$(printf '%-20s %s / %s' "$SERVICE" "$a" "$e")  ← journalctl -u $SERVICE 확인"

# ── 6. 검증 ──────────────────────────────────────────────────────
# "떴다"가 아니라 "게이트웨이에 로그인했고 DB에 붙었다"까지 봐야 배포 성공이다.
say "6. 검증"
log=$(journalctl -u "$SERVICE" --since "-2min" --no-pager 2>/dev/null || true)
printf '%s' "$log" | grep -q "DB 연결 확인" && ok "DB 연결" || bad "DB 연결 로그 없음"
if printf '%s' "$log" | grep -q "로그인"; then
  ok "$(printf '%s' "$log" | grep -o '\[bot\].*로그인.*' | tail -1)"
else
  bad "게이트웨이 로그인 로그 없음"
fi

say "결과"
if [ "$fail" -ne 0 ]; then
  printf '  \033[31m문제가 있습니다. 위 ✘ 를 확인하세요.\033[0m\n'
  printf '  \033[2m로그:  sudo %s --logs\033[0m\n\n' "$0"
  exit 1
elif [ "$CHECK_ONLY" -eq 1 ]; then
  printf '  \033[32m점검만 했습니다 (아무것도 바꾸지 않음)\033[0m\n\n'
else
  printf '  \033[32m봇 배포 완료 — 재부팅해도 자동으로 다시 뜹니다\033[0m\n\n'
fi
