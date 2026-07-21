-- 001_init — DiscordBot.md §G 스키마
--
-- 설계 메모
--  · 출생 번호는 SEQUENCE로만 발급한다(§A.5). 앱에서 max+1을 계산하면 동시에 두 명이
--    뽑을 때 같은 번호가 나온다 — 그 순간 "모든 생은 유일"(§B)이 깨진다.
--  · 일일 뽑기 횟수는 lives.created_at 카운트로 판정한다(§G). 별도 카운터 테이블을 두면
--    생은 들어갔는데 카운터가 안 오르는(또는 반대) 어긋남이 반드시 생긴다.
--  · 배틀·명예의전당 테이블은 4단계에서 쓰지만 스키마는 §G에 명세돼 있으므로 함께 만든다.
--    (테이블만 있고 쓰지 않는 것은 선구현이 아니다 — 마이그레이션을 쪼개면 나중에
--     운영 중인 DB에 스키마 변경을 또 걸어야 한다.)

CREATE SEQUENCE IF NOT EXISTS birth_seq;

CREATE TABLE IF NOT EXISTS users (
  discord_id  text PRIMARY KEY,
  merit       integer     NOT NULL DEFAULT 0 CHECK (merit >= 0),
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS lives (
  id            bigint      PRIMARY KEY DEFAULT nextval('birth_seq'),  -- 출생 번호
  user_id       text        NOT NULL REFERENCES users(discord_id) ON DELETE CASCADE,
  guild_id      text,                       -- 어느 서버에서 뽑았나(도감 집계용, DM이면 NULL)
  country_code  text        NOT NULL,       -- ISO 3166-1 alpha-2 (국기에서 파생)
  country_name  text        NOT NULL,       -- 뽑던 시점의 한국어 국가명(데이터가 바뀌어도 기록 보존)
  gender        text        NOT NULL CHECK (gender IN ('male','female')),
  lifespan      numeric     NOT NULL,       -- §G. core의 Life.lifeExp
  income_usd    numeric     NOT NULL,       -- core의 Life.income (원값도 남긴다)
  income_mult   numeric     NOT NULL,       -- §G. 국가 1인당 GDP 대비 배수
  income_top_pct numeric    NOT NULL,       -- 세계 소득 상위 %
  siblings      integer,                    -- §D. 출산율 데이터 부재로 아직 NULL (3단계)
  occupation    text,                       -- §D. 직업군 테이블 부재로 아직 NULL (3단계)
  urban         boolean     NOT NULL,
  -- 웹이 이미 뽑고 있어 /여권(3단계)에서 보여줄 값들. §G에는 없지만 버리면 복구할 수 없다.
  iq            integer     NOT NULL,
  height_cm     integer     NOT NULL,
  weight_kg     numeric     NOT NULL,
  religion      text        NOT NULL,
  ethnicity     text        NOT NULL,
  lefty         boolean     NOT NULL,
  balding       boolean     NOT NULL,
  traits        text[]      NOT NULL DEFAULT '{}',
  rarity_score  numeric     NOT NULL,       -- 작을수록 희귀. ×100 = "상위 n%"
  inherited_trait text,                     -- 업 계승으로 물려받은 특성(§C). 없으면 NULL
  name          text,                       -- 유저 명명 (3단계 /명명)
  wins          integer     NOT NULL DEFAULT 0,
  losses        integer     NOT NULL DEFAULT 0,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- 일일 뽑기 횟수 판정이 이 인덱스를 탄다. 없으면 유저의 생이 쌓일수록 /환생이 느려진다.
CREATE INDEX IF NOT EXISTS lives_user_created_idx ON lives (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS lives_guild_country_idx ON lives (guild_id, country_code);

CREATE TABLE IF NOT EXISTS guilds (
  guild_id   text PRIMARY KEY,
  settings   jsonb       NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 서버 공동 국가 컬렉션 (3단계 /도감). 기록은 2단계부터 쌓아야 도감이 비어 있지 않다.
CREATE TABLE IF NOT EXISTS guild_dex (
  guild_id      text NOT NULL,
  country_code  text NOT NULL,
  first_life_id bigint REFERENCES lives(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (guild_id, country_code)
);

-- 방문 도장 (4단계 /배틀 승리 시)
CREATE TABLE IF NOT EXISTS stamps (
  user_id      text NOT NULL,
  country_code text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, country_code)
);

-- 배틀 (4단계)
CREATE TABLE IF NOT EXISTS battles (
  id         bigserial PRIMARY KEY,
  life_a     bigint NOT NULL REFERENCES lives(id) ON DELETE CASCADE,
  life_b     bigint NOT NULL REFERENCES lives(id) ON DELETE CASCADE,
  axes       text[] NOT NULL,
  winner     bigint REFERENCES lives(id) ON DELETE SET NULL,
  upset      boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 명예의 전당 (4단계)
CREATE TABLE IF NOT EXISTS hall_of_fame (
  guild_id text NOT NULL,
  category text NOT NULL,
  life_id  bigint REFERENCES lives(id) ON DELETE CASCADE,
  PRIMARY KEY (guild_id, category)
);
