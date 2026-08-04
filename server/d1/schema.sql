-- Cloudflare D1 스키마 (VM counter.js 의 파일 저장을 대체)
--
--   wrangler d1 execute life-reroll --remote --file=server/d1/schema.sql
--
-- 전부 IF NOT EXISTS 라 여러 번 실행해도 안전하다.

-- 모두의 환생 횟수. 행 하나뿐이다 — id CHECK 로 두 번째 행이 못 생기게 못박는다.
CREATE TABLE IF NOT EXISTS counter (
  id    INTEGER PRIMARY KEY CHECK (id = 1),
  total INTEGER NOT NULL DEFAULT 0
);
INSERT OR IGNORE INTO counter (id, total) VALUES (1, 0);

-- 공유 링크 (짧은 코드 ↔ 서명 통과한 생). VM 의 shares.jsonl 을 대체.
CREATE TABLE IF NOT EXISTS shares (
  code       TEXT PRIMARY KEY,
  l          TEXT NOT NULL,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);

-- 행동 이벤트. VM 의 events.jsonl 을 대체하되 **dwell·roll 은 저장하지 않는다** —
-- 둘이 전체의 98%(피크 30만/일)라 D1 무료 쓰기(10만 행/일)를 넘긴다. 나머지 23종은
-- 피크 8.6천/일로 여유가 크다. 리롤 총량은 counter 가, 세션당 리롤 수는 exit.rolls 가 대신 든다.
CREATE TABLE IF NOT EXISTS events (
  id   INTEGER PRIMARY KEY AUTOINCREMENT,
  t    INTEGER NOT NULL,          -- 서버 수신 시각 ms (클라 시계 불신)
  e    TEXT    NOT NULL,
  p    TEXT    NOT NULL,          -- JSON 문자열
  ip_h TEXT    NOT NULL           -- 일 솔트 IP 해시 (원 IP 는 어디에도 없다)
);
CREATE INDEX IF NOT EXISTS idx_events_t ON events (t);
CREATE INDEX IF NOT EXISTS idx_events_e ON events (e, t);

-- 실시간 피드("지금 다른 사람들") 버퍼. VM 의 메모리 링 버퍼를 대체.
-- roll 이벤트를 1/20 로 샘플링해 넣는다(전량이면 dwell·roll 제외가 무의미해진다).
-- 피드는 최근 12개만 보여주므로 샘플이어도 충분히 찬다. 낡은 행은 track 가 지운다.
CREATE TABLE IF NOT EXISTS recent_rolls (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  c  TEXT    NOT NULL,            -- 나라 (한국어 원문 — 클라가 자기 언어로 옮긴다)
  t  INTEGER NOT NULL             -- 서버 수신 시각 ms
);

-- 일별 IP 해시 솔트. VM 은 메모리에 뒀지만 Workers 는 격리 인스턴스가 여러 개라
-- 같은 날 같은 솔트를 쓰려면 공유 저장소가 필요하다. 격리별로 하루 한 번 읽고 캐시한다.
CREATE TABLE IF NOT EXISTS salts (
  day  TEXT PRIMARY KEY,          -- KST 기준 YYYY-MM-DD
  salt TEXT NOT NULL
);
