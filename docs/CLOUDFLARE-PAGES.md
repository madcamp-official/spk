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

### 2. Pages 프로젝트 (완료 — 직접 업로드 방식)

~~Git 연결~~ 은 쓰지 않는다. 레포가 `madcamp-official` 조직 소유라 Cloudflare GitHub 앱
설치에 **조직 소유자 승인**이 필요했고, 직접 업로드는 GitHub 권한이 아예 필요 없다.
프로젝트는 이미 만들어져 있다:

```bash
npx wrangler pages project create life-reroll --production-branch main   # 이미 됨
```

**배포 = 로컬에서 한 줄.** push 자동 배포 대신 이걸 쓴다:

```bash
npm run deploy      # = build:core + wrangler pages deploy apps/web --branch main
```

`build:core` 가 반드시 먼저 돌아야 한다 — `apps/web/core/` 는 .gitignore 라 빌드가
만들고, 이게 없으면 앱도 /api/roll 도 통째로 죽는다(npm run deploy 가 순서를 보장한다).
`--branch main` 이 아니면 미리보기로 올라간다 — 실험할 땐 오히려 그걸 쓰면 된다
(`--branch 실험이름` → 별도 URL, 구 lab 의 역할).

> 나중에 조직 소유자가 GitHub 앱을 승인해 주면 대시보드에서 Git 연결로 갈아탈 수 있다
> (빌드 명령 `pnpm run build:core`, 출력 `apps/web`). 그때까진 직접 업로드로 충분하다.

### 3. 시크릿 (완료)

```bash
npx wrangler pages secret put LIFE_SECRET --project-name life-reroll
```

값은 **VM 백업(`life-reroll-vm-backup/counter.env`)의 LIFE_SECRET 그대로** 넣었다.
새로 만들면 이미 뿌린 공유 링크(?s=·?l=&sig=)의 서명이 전부 깨져 "위조된 링크"로 뜬다.

### 4. 첫 배포 확인 (완료 — 2026-08-04)

`https://life-reroll.pages.dev` 에서 전부 검증됐다:

- `/api/counter/health` → `{"ok":true,"total":1841126,"roll":true,"signing":true}`
- roll→verify 왕복(진짜 ok / 위조 거부) · 운세 결정성 · **VM 에서 뿌린 옛 공유 코드 조회**
- geo 쿠키·no-cache·immutable·`/en/`→301·없는 .js 404 (nginx 규칙 재현 전부)
- 실브라우저: ko 자동 선택 · 카운터 타일 표시 · 리롤 서명 · 공유 코드 발급 · 콘솔 에러 0
- 원격 D1: probe 이벤트 저장 확인, dwell 은 저장 안 됨(설계대로)

### 5. 컷오버 (완료 — 2026-08-05)

실행된 순서와 결과. 다시 할 일은 없고, 존을 초기화하게 되면 이 순서를 재현한다.

1. **시드 갱신** — VM 마지막 카운터(1,841,126)로 `make-d1-seed.mjs` 재생성 후 적용.
   D1 이 이미 더 컸고(검증 트래픽) `max()` 라 값 손실 0.
2. **터널 라우트 제거** — Zero Trust → Tunnels → life-reroll → Published application
   routes 에서 life-reroll.com·www 행 삭제(터널 자체는 VM 회수와 함께 소멸).
3. **DNS 확인** — 남은 레코드는 MX 5 + TXT(SPF) 뿐 = Namecheap 이메일 포워딩. 유지.
4. **Custom domains** — Pages 프로젝트에 `life-reroll.com`·`www.life-reroll.com` 추가.
5. **⚠ 존 Browser Cache TTL** — Caching → Configuration 에서 **Respect Existing
   Headers** 로 변경. 4 hours 로 남아 있으면 존이 `_headers` 의 no-cache 를
   `max-age=14400` 으로 **덮어써서**, JS 를 고쳐도 방문자가 4시간 옛 코드를 본다
   (README 의 "4시간 낡은 JS" 사고의 진짜 범인이 이 존 설정이었다).
6. **검증** — 정본·www 200, health(total 보존·서명 켜짐), roll↔verify, 옛 공유 코드,
   geo 쿠키, no-cache/immutable 헤더, /MT 404(의도) 전부 확인.

### 6. (선택) WAF 레이트리밋

함수 안의 리밋은 격리(isolate) 단위라 전역 방어로는 느슨하다. 대시보드 →
Security → WAF → Rate limiting rules (무료 1개): `/api/*` 에 IP 당 분당 300 정도.

## 운영 메모

- **배포 = `npm run deploy`** (직접 업로드 — git push 는 배포를 일으키지 않는다).
  미리보기는 `wrangler pages deploy apps/web --branch 이름` (lab 의 후계).
- 무료 한도에서 실제로 가까운 것은 **함수 호출 10만/일** 이다. `_routes.json` 이
  정적 자산을 함수 밖으로 절였기 때문에 호출 = API + HTML 페이지뷰뿐. 7월 피크
  (리롤 30만/일) 재현 시 3~5만/일로 추정 — 그보다 크게 터지면 여기가 먼저 막힌다.
- D1 이 진실의 원천이다. 가끔 백업: `npx wrangler d1 export life-reroll --remote --output=backup.sql`
- 이벤트 분석: `node tools/fetch-events.mjs` 가 D1 을 VM 시절과 같은 events.jsonl 로
  내려준다(`--merge` 로 백업 병합) → `python3 tools/analyze.py events.jsonl` 그대로.
- Discord 봇도 이 프로젝트에 산다(아래 절) — VM 과 무관해졌다.

## Discord 봇 — HTTP Interactions (functions/discord.js)

게이트웨이 상주(discord.js) 대신 Discord 가 `https://life-reroll.com/discord` 로 인터랙션을
POST 한다. 커맨드 6종(환생·여권·덱·명명·도감·배틀)+버튼 3종 전부 이식했고, **라이브에서
26개 항목 e2e 통과**(서명·전 커맨드·버튼 권한·일일 한도·트랜잭션 부수효과, 스모크 데이터는
정리함). 슬래시 커맨드는 Discord 에 이미 등록돼 있어 재등록이 필요 없다.

- DB: Workers → **Hyperdrive**(캐싱 꺼짐) → Supabase. workerd 에서 Postgres TLS 직결은
  pg·postgres.js 둘 다 연결 루프로 실패한다 — Hyperdrive 가 TLS·풀링을 대신한다.
  캐싱을 끈 이유: `countRollsToday` 가 방금 넣은 행을 못 보면 "1일 3회"가 뚫린다.
- 시크릿: `DATABASE_URL`(폴백)·`DISCORD_TOKEN`(도감 제목의 서버 이름 조회용)은 넣어 뒀다.
  LLM_* 은 선택(미설정 = 템플릿 요약 — VM 운영과 동일). 초상(camp-4 GPU)은 VM 운영에서도
  꺼져 있었고 이식하지 않았다.
- 로컬 한계: 이 개발 머신의 wrangler 로컬 workerd 는 외부 TCP 가 안 붙는다 — DB 경로는
  라이브에서 검증한다(비 DB 경로는 서명 하네스로 로컬 검증 가능).

### 봇 컷오버 — 사람이 할 일 (사이트와 독립, 원할 때)

1. **진짜 공개키로 교체** — 지금 `DISCORD_PUBLIC_KEY` 는 e2e 용 테스트 키다(그래서 실제
   Discord 요청은 401 로 거절된다 = 휴면). [developer portal](https://discord.com/developers/applications)
   → 해당 앱 → General Information → **Public Key** 복사 후:
   ```bash
   npx wrangler pages secret put DISCORD_PUBLIC_KEY --project-name life-reroll
   ```
2. 같은 페이지의 **Interactions Endpoint URL** 에 `https://life-reroll.com/discord` 입력 → Save.
   Discord 가 PING + 위조 서명 검사를 통과해야 저장된다(둘 다 구현·검증돼 있다).
3. 저장되는 순간이 컷오버다 — 이후 모든 인터랙션이 여기로 온다. VM 의 게이트웨이 봇은
   더 이상 인터랙션을 받지 않는다(따로 끌 필요도 없지만, 정리한다면
   `systemctl disable --now life-reroll-bot`).
4. 서버에서 `/환생` 한 번 눌러 확인. 문제가 생기면 Interactions Endpoint URL 을 비우면
   즉시 게이트웨이 방식으로 돌아간다(VM 봇이 살아 있는 동안).

## 옛 VM 에서 가져온 것 (레포 밖, `life-reroll-vm-backup/`)

counter.json(1,841,104 시점) · shares.jsonl(114건) · events.jsonl.gz(119만 행) ·
counter.env(**LIFE_SECRET — 유출 주의**) · nginx·systemd·터널 설정 · 미커밋 문서.
OneDrive 에 있고 레포에는 절대 커밋하지 않는다.
