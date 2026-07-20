# apps/bot — Life Reroll Discord 봇

구현 기준 문서는 레포 루트의 [DiscordBot.md](../../DiscordBot.md)다. 이 파일은 **돌리는 법**만 적는다.

현재 상태: **4단계 완료** — DiscordBot.md §H의 모든 커맨드가 구현되었다.
/환생 · /여권 · /덱 · /명명 · /도감 · /배틀

## 돌리기

```bash
cp apps/bot/.env.example apps/bot/.env    # 값을 채운다
pnpm install

pnpm -F @life-reroll/bot migrate          # DB 스키마 적용 (§G)
pnpm -F @life-reroll/bot sync-commands    # 슬래시 커맨드 등록 (DEV_GUILD_ID면 즉시 반영)
pnpm -F @life-reroll/bot dev              # 봇 기동
```

비밀값 없이 로직만 확인하려면:

```bash
pnpm -F @life-reroll/bot verify           # WASM Postgres로 실제 SQL까지 검증 (30개 체크)
```

## VM에 상주시키기 (배포)

봇은 게이트웨이에 상시 연결된 **장기 실행 프로세스**다(§A.1). 웹처럼 파일을 복사하면 끝이
아니라 프로세스를 계속 살려 둬야 해서, 웹과는 배포 스크립트가 다르다.

```bash
# ① 비밀값 파일 (레포에 없다. 한 번만)
sudo install -m 600 /dev/null /etc/life-reroll-bot.env
sudo nano /etc/life-reroll-bot.env
#   DISCORD_TOKEN=...
#   DISCORD_APP_ID=...
#   DEV_GUILD_ID=              ← 운영에서는 비운다(전역 커맨드, 반영에 최대 1시간)
#   DATABASE_URL=postgresql://...
#   PGSSLMODE=require
#   ROLL_DAY_TZ=Asia/Seoul
#   ⚠ UNLIMITED_ROLLS 는 넣지 않는다 — 테스트 전용이고, 배포 스크립트가 막는다

# ② 배포
sudo ./deploy-bot.sh --pull    # git pull → 빌드 → 커맨드 등록 → 재시작 → 검증

# ③ 확인
./deploy-bot.sh --check        # 아무것도 바꾸지 않고 상태만 (sudo 불필요)
./deploy-bot.sh --logs         # 최근 로그
```

- **재부팅해도 자동으로 뜬다** (`systemctl enable`). 끊겨도 5초 뒤 되살아난다.
- 5분에 10번 실패하면 포기하고 `failed` 로 남는다 — 토큰이 틀렸는데 영원히 재시작하며
  로그만 태우는 것을 막기 위해서다. `--logs` 로 원인을 본다.
- 유닛 파일은 [life-reroll-bot.service](life-reroll-bot.service)이고 배포 때 자동 설치된다.
  **비밀값은 유닛이 아니라 `/etc/life-reroll-bot.env`** 에 둔다 — 유닛은 레포에 커밋되기 때문이다.
- 봇은 `/root/spk` 레포에서 그대로 돈다(웹처럼 `/var/www` 로 복사하지 않는다).
  `node_modules` 가 필요한 프로세스라 복사보다 제자리 실행이 단순하다.
- **슬래시 커맨드는 코드 배포로 갱신되지 않는다.** Discord 쪽에 등록된 정의라
  `deploy-bot.sh` 가 매번 다시 등록한다.

## 구조

```
src/
  index.ts            엔트리. 게이트웨이 연결 + 인터랙션 라우팅
  env.ts              환경변수 검증 (없으면 즉시 종료)
  deploy-commands.ts  슬래시 커맨드 등록 (길드 스코프 우선)
  verify.ts           pglite 기반 자체 검증
  commands/
    reroll.ts         /환생 — 일일 횟수·공덕·업 계승 버튼
  db/
    pool.ts           pg 풀 + Db 추상(트랜잭션 포함)
    queries.ts        SQL은 전부 여기. 커맨드 파일에는 SQL이 없다
    migrate.ts        마이그레이션 러너 (의존성 0)
    migrations/001_init.sql
  lib/
    summary.ts        §F 인생 요약 — 템플릿 + LLM(선택)
    render.ts         임베드·버튼
    text.ts           표시 문구 (한국어)
```

## 알아 둘 것

- **봇은 독립 프로세스다**(§A.1). Next.js·서버리스에 얹지 않는다. 게이트웨이에 상시 연결된다.
- **인텐트는 `Guilds` 하나뿐**이다. 슬래시 커맨드만 쓰므로 Message Content Intent를 켜지 않는다(§A.7, §I).
- **버튼은 stateless**(§A.6). `karma:<유저ID>:<특성키>` 처럼 custom_id에 상태를 인코딩해서
  봇을 재배포해도 이전 메시지의 버튼이 그대로 동작한다.
- **뽑기 결과는 공개**다(§C). ephemeral로 만들지 않는다 — 서버 안에서 목격되는 것이 확산 엔진이다.
  단 "오늘 뽑기를 다 썼다" 같은 **거절 메시지는 ephemeral**이다. 뽑기 결과가 아니고, 공개하면 망신주기가 된다.
- **밸런스 수치는 여기 없다**. 전부 [packages/core/src/config.ts](../../packages/core/src/config.ts)에 있다(§A.8).
  이 패키지에 숫자를 하드코딩하면 §I 위반이다.
- **LLM은 선택**이다. `LLM_BASE_URL`이 비면 템플릿만 쓰고 봇은 정상 동작한다.
  설정해도 레어 생(기본 상위 0.1%)에만 부르고, 타임아웃(기본 8초)이면 템플릿으로 되돌아온다(§F).

## 아직 못 만든 것 (데이터가 없어서)

`/환생` 결과에 **형제 수·직업군이 없다**. §D는 국가 출산율(포아송)과 소득수준별 직업군
테이블을 요구하지만 데이터셋에 둘 다 없다. core에는 시그니처만 있고 호출하면 사유와 함께
예외를 던진다 — 조용히 0이나 빈 문자열이 지표에 섞이지 않게 하려는 것이다.
특성 태그 「대가족」도 형제 수가 있어야 만들 수 있다.
