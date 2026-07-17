# 🌏 환생 시뮬레이터 (Samsara Simulator)

실제 지구 인구 분포 확률 그대로 다음 생을 뽑는 웹 시뮬레이터.
리롤을 반복하다가 마음에 드는 생이 나오면 카드로 만들어 공유한다.

- **라이브**: https://omok00.github.io/rebirth-simulator/
- **스택**: 정적 HTML 단일 파일 (프레임워크·서버 없음), GitHub Pages 배포

## 핵심 아이디어

환생 확률은 전부 현실 통계를 따른다. 인도로 태어날 확률 17.9%, 중국 17.5%,
대한민국 0.64%, 모나코는 약 20만분의 1. 희귀한 나라일수록 가챠 등급(N/R/SR/SSR/UR)이
올라가고, 원하는 조건이 나올 때까지 자동 리롤할 수 있다.

## 기능 명세

| 기능 | 설명 |
|---|---|
| 환생 뽑기 | 198개국 인구 가중 추첨 + 성별(출생 성비)·도시/농촌(도시화율)·모국어·종교·혈액형·생일/별자리·왼손잡이·쌍둥이·기대수명·세계 소득 백분위 |
| 가챠 등급 | 국가 인구 기준 N(1억+) / R(2,500만+) / SR(500만+) / SSR(50만+) / UR(50만 미만). SSR 이상 컨페티 |
| 소원 자동 환생 | 대륙/국가/성별 조건 선택 → 확률·평균 필요 횟수 표시 → 초당 수천 회 리롤, 최대 200만 회 |
| 오늘의 환생 운세 | 날짜+기기 시드 고정 롤. 하루 동안 같은 결과 + 운세 문장 (재방문 유도) |
| 환생 도감 | 태어나 본 나라 수집 현황 198칸 그리드 (수집욕 리텐션) |
| 공유 | 결과 카드 PNG(1080x1350) 저장, 텍스트 복사, 모바일 공유 시트(이미지 첨부) |
| 이모지 피드백 | 결과마다 😐/😂/🔥 한 번 클릭 평가 (행동 데이터 수집) |
| 누적 통계 | 총 환생 횟수, 도감 진행률, 최고 희귀 기록 (localStorage) |

## 반응 수집 설계 (배포 → 반응 → 개선 루프)

### 유입 추적 규약

홍보 채널마다 URL에 `?ref=` 파라미터를 붙여 배포한다.

```
https://omok00.github.io/rebirth-simulator/?ref=everytime
https://omok00.github.io/rebirth-simulator/?ref=instagram
https://omok00.github.io/rebirth-simulator/?ref=discord
```

사용자가 앱에서 공유하면 자동으로 `?ref=share&v=a|b`가 붙는다.
`v`는 공유 문구 A/B 테스트 변형이다 (기기별 고정 배정).

- **a (스토리형)**: "나는 브라질 도시에서 여자로 태어났다"
- **b (성과형)**: "확률 0.26%의 환생 뽑기 성공! 대한민국 R 등급"

유입된 `v` 값 분포를 보면 어느 문구가 더 사람을 데려오는지 알 수 있다.

### 수집 이벤트 (AARRR 매핑)

| 이벤트 | 속성 | 퍼널 |
|---|---|---|
| `visit` | ref, v | Acquisition |
| `roll` | country, tier | Activation |
| `fortune` | country, first | Retention |
| `collection_open` | owned | Retention |
| `auto_start` / `auto_success` | target / attempts | Engagement |
| `share_text` / `share_card` / `share_native` | country, tier | Referral |
| `feedback` | emoji(😐/😂/🔥), country, tier | 만족도 |

### 분석 도구 연결

`index.html` 맨 아래 안내 주석 위치에 GA4 / PostHog / Plausible 스니펫을
붙여넣기만 하면 된다. `track()`이 전역 객체(gtag/posthog/plausible)를 감지해
모든 이벤트를 자동 전송한다. 스니펫이 없어도 앱은 정상 동작한다
(이벤트는 localStorage `rebirth_state.metrics`에 로컬 집계).

## 로컬 실행 · 배포

```bash
# 로컬 실행 (아무 정적 서버)
python -m http.server 8791
# → http://localhost:8791/index.html

# OG 썸네일 재생성 (수정 시)
python tools/make_og.py
```

`main` 브랜치에 push하면 GitHub Actions가 Pages로 자동 배포한다
([.github/workflows/pages.yml](.github/workflows/pages.yml)).

## 데이터 출처와 한계

인구·도시화율·기대수명·1인당 GDP는 UN World Population Prospects 2024,
세계은행 등 공개 통계 기반 **근사치**를 코드에 내장했다 ([index.html](index.html)의 `RAW` 배열).
종교·혈액형 분포는 국가/대륙 대표값이고, 소득 백분위는 1인당 GDP에
로그정규 편차를 더한 추정이다. 오락용이며 학술적 정확성을 보장하지 않는다.

개선 이력과 다음 실험 후보는 [IMPROVEMENT_LOG.md](IMPROVEMENT_LOG.md)에 기록한다.
