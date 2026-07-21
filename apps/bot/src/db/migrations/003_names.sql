-- 003_names — 생성 이름 스냅샷
--
-- 이름은 core가 생의 고정값에서 결정적으로 파생한다(names.ts). 그래도 저장하는 이유:
-- 이름 풀을 수정하면 파생 결과가 바뀌는데, 봇의 생은 **기록**이라 뽑던 날의 이름이
-- 보존돼야 한다. (웹 공유 링크는 파생에 의존한다 — 그쪽은 사인 가중치 조정 때와 같은
-- 트레이드오프를 이미 받아들였다.)
--
-- name 컬럼(§G, 유저 명명)과는 별개다: name은 유저가 붙인 별명, gen_name은 태어날 때
-- 받은 이름이다. 표시는 name ?? gen_name 순서.
ALTER TABLE lives ADD COLUMN IF NOT EXISTS gen_name text;      -- ko 표기 (봇 UI가 한국어)
ALTER TABLE lives ADD COLUMN IF NOT EXISTS gen_name_alt text;  -- 반대 표기 (원문자 문화권만)
