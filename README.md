# 🌏 환생 시뮬레이터 (Samsara Simulator)

실제 지구 인구 분포 확률 그대로 다음 생을 뽑는 웹 시뮬레이터.
리롤을 반복하다가 마음에 드는 생이 나오면 카드로 만들어 공유한다.

- **라이브**: https://life-reroll.madcamp-kaist.org/
- **레포**: https://github.com/madcamp-official/spk (몰입캠프 26s-w3-c1-03)
- **스택**: 정적 HTML 단일 파일 + 국기 웹폰트. 프레임워크·빌드 없음.
  "모두의 환생 횟수" 하나 때문에 의존성 없는 Node 카운터([server/counter.js](server/counter.js))가 붙는다 — 이것만 서버가 필요하고, 없으면 해당 타일만 숨겨진 채 나머지는 그대로 동작한다.

## 핵심 아이디어

환생 확률은 전부 현실 통계를 따른다. 인도로 태어날 확률 17.9%, 중국 17.5%,
대한민국 0.64%, 투발루는 약 400만분의 1. 등급 이름 대신 **확률 숫자 자체**를
보여준다. "SSR"보다 "0.0003% · 약 32만번 중 1번"이 더 세다.

## 기능 명세

| 기능 | 설명 |
|---|---|
| 환생 뽑기 | 198개국 인구 가중 추첨 + 성별(출생 성비)·도시/농촌(도시화율)·모국어·종교·왼손잡이·기대수명·연 소득(USD) |
| 희귀도 표현 | 등급 없음. 확률(%)과 "약 N번 중 1번"으로 표시하고, 국가 인구에 따라 카드 테두리 색만 달라진다. 인구 500만 미만이면 컨페티 |
| 오늘의 환생 운세 | 날짜+기기 시드 고정 롤. 하루 동안 같은 결과 + 운세 문장 (재방문 유도) |
| 환생 도감 | 태어나 본 나라 수집 현황 198칸 그리드 (수집욕 리텐션) |
| 공유 | 결과 카드 PNG(1080x1350) 저장, 텍스트 복사, 모바일 공유 시트(이미지 첨부) |
| 이모지 피드백 | 결과마다 😐/😂/🔥 한 번 클릭 평가 (행동 데이터 수집) |
| 한 줄 제안 | "이런 항목도 넣어 주세요" 입력창 — 유일한 직접 의견 통로 |
| 누적 통계 | 나의 환생 횟수, 도감 진행률, 최고 희귀 기록 (localStorage) |
| 모두의 환생 횟수 | 방문자 전체가 뽑은 환생의 합계. `/api/counter`로 읽고 환생마다 1씩 올린다 |
| 국기 표시 | 윈도우에는 국기 이모지 글리프가 없어 "KR" 두 글자로 나온다. 국기 코드포인트만 담은 Twemoji 웹폰트를 얹어 전 OS에서 국기가 보인다 |

## 반응 수집 설계 (배포 → 반응 → 개선 루프)

### 유입 추적 규약

홍보 채널마다 URL에 `?ref=` 파라미터를 붙여 배포한다.

```
https://life-reroll.madcamp-kaist.org/?ref=everytime
https://life-reroll.madcamp-kaist.org/?ref=instagram
https://life-reroll.madcamp-kaist.org/?ref=discord
```

사용자가 앱에서 공유하면 자동으로 `?ref=share&v=a|b`가 붙는다.
`v`는 공유 문구 A/B 테스트 변형이다 (기기별 고정 배정).

- **a (스토리형)**: "나는 브라질 도시에서 여자로 태어났다"
- **b (성과형)**: "확률 0.26%의 환생 뽑기 성공! 대한민국"

**한 기기는 유입자이면서 동시에 공유자다.** 그래서 두 값을 분리해서 싣는다.

| 필드 | 뜻 | 쓰는 곳 |
|---|---|---|
| `vin` | 나를 **데려온** 공유 문구 (URL `?v=`, 첫 유입값 고정) | 문구 A/B 비교 |
| `v` | 내가 **공유할 때 쓸** 문구 (기기별 무작위 배정) | 공유 문구 선택 |

둘을 한 필드로 합치면 유입 분포가 자기 동전던지기에 묻혀 항상 50:50이 된다.
문구 성과는 반드시 `vin`으로 읽는다.

### 수집 이벤트 (AARRR 매핑)

모든 이벤트에 `ref`·`vin`·`v`가 자동으로 붙는다.

| 단계 | 이벤트 | 속성 | 읽는 법 |
|---|---|---|---|
| **Acquisition** · 획득 | `visit` | ref, vin | 채널별 신규 방문 수 |
| **Activation** · 활성화 | `activate` | ms, returning | 첫 방문에서 첫 리롤까지 걸린 시간. 이 이벤트가 없는 `visit`은 버튼도 안 눌러 본 이탈 |
| **Retention** · 리텐션 | `fortune`, `collection_open` | first / owned | `first=true` 비율 = 매일 첫 방문 |
| **Referral** · 추천 | `share_text`, `share_card`, `share_native` | country, prob | 발생 수 대비 `ref=share` 유입 수 = 바이럴 계수 |
| **Revenue** · 매출 | — | — | **없음. 무료 서비스라 이 단계는 비어 있다** (아래 참고) |

수집 통로(퍼널 단계는 아니지만 개선 근거가 되는 이벤트):

| 이벤트 | 속성 | 무엇을 알려 주나 |
|---|---|---|
| `feedback` | emoji(😐/😂/🔥), country, prob | 어떤 결과가 웃긴지 |
| `suggest` | text, country | 사용자가 직접 요청한 항목 |
| `exit` | rolls, activated | 떠나기 전 몇 번 굴렸나 (평균 리롤 수) |
| `roll` | country, prob | 결과 분포. `prob`이 있어 "희귀한 생일수록 더 공유되는가"를 볼 수 있다 |

#### Revenue 단계에 대해

수업 자료의 AARRR은 5단계지만 이 서비스에는 매출이 없다. 억지로 채우는 대신
비워 두고, "얼마나 멀리 퍼지는가"를 묻는 주제 2에서는 **Referral을 최종 지표로**
본다. 굳이 붙인다면 후원 링크나 결과 카드 굿즈 정도가 후보이며, 현재 계획에는 없다.

#### Activation을 `roll`로 재지 않는 이유

첫 리롤은 사실상 모든 방문자가 누른다. 그래서 `roll`을 Activation으로 잡으면
Acquisition과 거의 같은 숫자가 나와 퍼널이 아무것도 걸러내지 못한다. 대신
**`activate`의 `ms`(첫 리롤까지 걸린 시간)** 로 잡는다. 이 값이 길면 첫 화면 설명이
길다는 뜻이고, `visit`은 있는데 `activate`가 없으면 버튼조차 누르지 않고 떠난 것이다.

### 분석 도구 연결

`index.html` 맨 아래 안내 주석 위치에 GA4 / PostHog / Plausible 스니펫을
붙여넣기만 하면 된다. `track()`이 전역 객체(gtag/posthog/plausible)를 감지해
모든 이벤트를 자동 전송한다. 스니펫이 없어도 앱은 정상 동작한다
(이벤트는 localStorage `rebirth_state.metrics`에 이름별 횟수만 로컬 집계).

> ⚠️ **스니펫을 붙이기 전까지 위 표의 지표는 하나도 읽을 수 없다.**
> 정적 페이지라 서버가 없어서 `track()`이 보낼 곳이 없다. 특히 `suggest`의
> 제안 **본문**은 사용자 기기의 localStorage에만 남아 팀에 도달하지 않는다.
> 배포보다 스니펫 연결이 먼저다.

## 로컬 실행 · 배포

```bash
# 로컬 실행 (아무 정적 서버)
python -m http.server 8791
# → http://localhost:8791/index.html
#   카운터 서버가 없으므로 "모두의 환생 횟수" 타일만 안 보이고 나머지는 정상 동작한다.

# 카운터까지 같이 띄우려면 (선택)
COUNTER_FILE=./counter.json node server/counter.js   # → 127.0.0.1:1558

# OG 썸네일 재생성 (수정 시, Pillow 필요)
pip install pillow
python tools/make_og.py
```

### 실제 배포 (life-reroll.madcamp-kaist.org)

캠프 VM(`camp-15`)에서 nginx가 `/var/www/life-reroll`를 서빙하고, Cloudflare Tunnel이
그 앞에 붙어 있다. `git pull`만으로는 반영되지 않는다:

```bash
cd ~/spk && git pull
install -m 644 index.html og-image.png TwemojiCountryFlags.woff2 /var/www/life-reroll/
sudo chown -R www-data:www-data /var/www/life-reroll
# counter.js를 고쳤다면
sudo install -m 644 server/counter.js /opt/life-reroll/counter.js && sudo systemctl restart life-reroll-counter
```

nginx가 `/api/`를 카운터(`127.0.0.1:1558`)로 프록시하며, 터널 뒤라 모든 요청이
`127.0.0.1`에서 오므로 `CF-Connecting-IP`로 실제 IP를 복원해 IP당 레이트리밋을 건다.

> **GitHub Pages 워크플로와 CNAME은 현재 무효다.** 도메인은 터널이 가리키고 있어
> Pages 쪽 커스텀 도메인은 인증되지 않는다. Pages로 되돌리려면 터널 호스트네임을 지우고
> `madcamp-official.github.io`로 CNAME을 만들어야 하며, 그 경우 카운터 서버는 못 쓴다
> ([.github/workflows/pages.yml](.github/workflows/pages.yml)).

## 데이터 출처와 한계

인구·도시화율·기대수명·1인당 GDP는 UN World Population Prospects 2024,
세계은행 등 공개 통계 기반 **근사치**를 코드에 내장했다 ([index.html](index.html)의 `RAW` 배열).
종교 분포는 국가 대표값이고, 연 소득(USD)은 1인당 GDP에 로그정규 편차를 더한
추정이라 실제 개인 소득이 아니다. 오락용이며 학술적 정확성을 보장하지 않는다.

개선 이력과 다음 실험 후보는 [IMPROVEMENT_LOG.md](IMPROVEMENT_LOG.md)에 기록한다.
