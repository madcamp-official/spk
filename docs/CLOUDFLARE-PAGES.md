# Cloudflare Pages 배포 — 현재 정본 절차

캠프 VM(camp-15) 회수로 [server/DEPLOY.md](../server/DEPLOY.md)의 VM 배포를 대체한다.
코드·설정은 전부 레포에 있고(functions/ · apps/web/_headers 등 · wrangler.toml ·
server/d1/), **아래 대시보드 작업만 사람 손이 필요하다.** 로컬에서 전 API·정적 계층·
브라우저 통합까지 검증을 마친 상태다.

## 구조 한 장

```
브라우저 ── life-reroll.com (Cloudflare DNS — 이미 내 계정의 존)
              │
              ▼
        Cloudflare Pages
        ├─ 정적: apps/web (빌드가 core 를 만들어 넣음)
        │    _headers      css·js no-cache / woff2 immutable   (구 nginx 캐시 규칙)
        │    _redirects    /en/ → /en                          (구 nginx 301)
        │    _routes.json  함수 태울 경로 절임 — 무료 호출 한도 보호
        │    404.html      SPA 폴백 차단 — .js 에 HTML 오염 방지 (구 try_files =404)
        ├─ functions/_middleware.js   geo 쿠키 (구 nginx Set-Cookie $http_cf_ipcountry)
        └─ functions/api/*            /api/ 11종 (구 server/counter.js) ── D1
```

VM 과 달라진 것: `/api/track` 이 **dwell·roll 을 저장하지 않는다**(전체의 98%,
피크 30만/일 — D1 무료 쓰기 10만/일 초과. 나머지 23종은 피크 8.6천/일).
실시간 피드는 roll 1/20 샘플로 채운다. 실험판(lab)은 제거 — 브랜치 미리보기가 대신한다.

## 사람이 해야 하는 일 (순서대로)

### 1. D1 만들기 + 스키마·시드

```bash
npx wrangler login                       # 브라우저로 내 Cloudflare 계정 인증
npx wrangler d1 create life-reroll       # 출력된 database_id 를 복사
# → wrangler.toml 의 REPLACE_WITH_D1_DATABASE_ID 를 그 값으로 바꿔 커밋
npx wrangler d1 execute life-reroll --remote --file=server/d1/schema.sql
npx wrangler d1 execute life-reroll --remote --file=server/d1/seed.sql
```

### 2. Pages 프로젝트 만들기 (대시보드)

Workers & Pages → Create → Pages → **Connect to Git** → `madcamp-official/spk` 선택
(GitHub 앱 권한 승인 필요).

| 설정 | 값 |
|---|---|
| Production branch | `main` |
| Build command | `pnpm run build:core` |
| Build output directory | `apps/web` (wrangler.toml 이 이미 선언 — 자동 인식됨) |

빌드 명령을 빼먹으면 **앱이 통째로 죽는다** — `apps/web/core/` 는 .gitignore 라
레포에 없고 빌드가 만든다.

### 3. 시크릿

```bash
npx wrangler pages secret put LIFE_SECRET --project-name life-reroll
```

값은 **VM 백업(`life-reroll-vm-backup/counter.env`)의 LIFE_SECRET 그대로.**
새로 만들면 이미 뿌린 공유 링크(?s=·?l=&sig=)의 서명이 전부 깨져 "위조된 링크"로 뜬다.

### 4. 첫 배포 확인 (`*.pages.dev` 주소에서)

```bash
curl -s https://life-reroll.pages.dev/api/counter/health
#  → {"ok":true,"total":1841126,"roll":true,"signing":true}
#  roll/signing 이 false 면 3번(시크릿)이 안 먹은 것
```

사이트를 열어 리롤·공유·운세가 도는지 눈으로 확인.
받은 공유 링크 하나(`?s=옛코드`)도 열어 본다 — 시드가 제대로 들어갔으면 생이 그려진다.

### 5. 컷오버 (도메인 연결)

```bash
# ① 시드 갱신 — VM 이 마지막 순간까지 세던 값을 가져온다
curl -s https://life-reroll.com/api/counter        # 값 확인
node tools/make-d1-seed.mjs <백업>/shares.jsonl <그 값>
npx wrangler d1 execute life-reroll --remote --file=server/d1/seed.sql
#   (UPDATE 가 max() 라 여러 번 실행해도 값이 뒤로 가지 않는다)
```

② 대시보드에서 기존 **터널의 public hostname 제거**
   (Zero Trust → Tunnels → life-reroll.com 항목 삭제 — 안 지우면 DNS 레코드 충돌)

③ Pages 프로젝트 → Custom domains → `life-reroll.com` 과 `www.life-reroll.com` 추가
   (존이 같은 계정에 있으므로 CNAME 이 자동 생성된다)

④ 확인: `curl -s https://life-reroll.com/api/counter` 값이 ①과 같거나 크면 완료.

### 6. (선택) WAF 레이트리밋

함수 안의 리밋은 격리(isolate) 단위라 전역 방어로는 느슨하다. 대시보드 →
Security → WAF → Rate limiting rules (무료 1개): `/api/*` 에 IP 당 분당 300 정도.

## 운영 메모

- **배포 = git push.** main 푸시가 프로덕션, 다른 브랜치·PR 은 미리보기 URL (lab 의 후계).
- 무료 한도에서 실제로 가까운 것은 **함수 호출 10만/일** 이다. `_routes.json` 이
  정적 자산을 함수 밖으로 절였기 때문에 호출 = API + HTML 페이지뷰뿐. 7월 피크
  (리롤 30만/일) 재현 시 3~5만/일로 추정 — 그보다 크게 터지면 여기가 먼저 막힌다.
- D1 이 진실의 원천이다. 가끔 백업: `npx wrangler d1 export life-reroll --remote --output=backup.sql`
- 이벤트 분석(`tools/analyze.py`)은 JSONL 대신 D1 을 본다:
  `npx wrangler d1 execute life-reroll --remote --command "SELECT ..." --json`
- Discord 봇은 별도 작업(HTTP Interactions 전환 예정). VM 이 죽으면 봇도 멈춘다 —
  사이트와는 무관하다.

## 옛 VM 에서 가져온 것 (레포 밖, `life-reroll-vm-backup/`)

counter.json(1,841,104 시점) · shares.jsonl(114건) · events.jsonl.gz(119만 행) ·
counter.env(**LIFE_SECRET — 유출 주의**) · nginx·systemd·터널 설정 · 미커밋 문서.
OneDrive 에 있고 레포에는 절대 커밋하지 않는다.
