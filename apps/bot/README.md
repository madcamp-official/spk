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
