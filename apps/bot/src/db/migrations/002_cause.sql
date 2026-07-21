-- 002_cause — 왼손잡이 항목이 사인(사망 원인)으로 교체되었다
--
-- 웹에서 「왼손잡이/오른손잡이」 칸을 빼고 「사인」을 넣었다(core rollCause).
-- 봇도 같은 core를 쓰므로 저장 스키마를 맞춘다.
--
-- lefty는 지우지 않고 남긴다. 이미 뽑힌 생들의 기록이고, NOT NULL만 풀면 새 INSERT는
-- 값을 안 넣어도 된다 — 컬럼을 떨어뜨리면 그 생들의 과거가 사라진다.
-- (지금은 아무 화면도 lefty를 읽지 않는다. 나중에 정리하려면 별도 마이그레이션으로.)
ALTER TABLE lives ALTER COLUMN lefty DROP NOT NULL;

-- 사인. 링크·저장에 싣지 않아도 core가 되살릴 수 있지만(고정값 해시), 기록으로 남겨 둔다 —
-- 나중에 사인 분포를 집계하거나 CAUSES 가중치를 바꿔도 그때의 결과가 보존된다.
ALTER TABLE lives ADD COLUMN IF NOT EXISTS cause_key text;
ALTER TABLE lives ADD COLUMN IF NOT EXISTS cause_emoji text;
