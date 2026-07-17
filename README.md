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
| 체류 시간 계측 | 결과를 몇 초 들여다보다 리롤했는지 자동 수집. UI 없음 (이모지 평가를 대체) |
| 한 줄 제안 | 하단 "이런 항목도 넣어 주세요" 입력창 — 유일한 직접 의견 통로 |
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
| `dwell` | ms, country, prob, shared, reason | **이 생이 마음에 들었나.** 오래 볼수록 좋았던 것 |
| `suggest` | text, country | 사용자가 직접 요청한 항목 |
| `exit` | rolls, activated | 떠나기 전 몇 번 굴렸나 (평균 리롤 수) |
| `roll` | country, prob | 결과 분포. `prob`이 있어 "희귀한 생일수록 더 공유되는가"를 볼 수 있다 |

#### 이모지 평가(😐/😂/🔥)를 걷어내고 체류 시간으로 바꾼 이유

이모지 평가는 **말한 의견**이고, 체류 시간은 **드러난 의견**이다. 이 표의 첫 줄이
"행동 데이터가 곧 의견"인 이유가 그것이다. 이모지는 클릭을 요구해서
① 응답률이 낮고(누른 사람만 집계) ② 이미 마음에 든 사람 쪽으로 표본이 쏠린다.
반면 체류 시간은 **모든 생에서 100% 수집되고, 사용자에게 아무것도 요구하지 않는다.**

```
dwell {ms:3540, country:"인도네시아", shared:false}  → 3.5초 들여다봄
dwell {ms:1603, country:"수단",      shared:true }  → 보고 공유까지 함 ★
dwell {ms:537,  country:"중국",      shared:false}  → 0.5초 만에 리롤 = 심심함
```

읽는 법: **희귀도(prob) 구간별 `ms` 중앙값**을 본다. 희귀한 생인데도 체류가 짧으면
연출이 약하다는 뜻이고("너무 빨리 떠나면 결과 화면이 심심하다는 뜻"),
`shared:true`인 생의 특징을 모으면 "공유가 터지는 결과 유형"이 그대로 나온다.
`reason`은 그 생을 왜 떠났는지다(`reroll`/`fortune`/`exit`).

#### Revenue 단계에 대해

수업 자료의 AARRR은 5단계지만 이 서비스에는 매출이 없다. 억지로 채우는 대신
비워 두고, "얼마나 멀리 퍼지는가"를 묻는 주제 2에서는 **Referral을 최종 지표로**
본다. 굳이 붙인다면 후원 링크나 결과 카드 굿즈 정도가 후보이며, 현재 계획에는 없다.

#### Activation을 `roll`로 재지 않는 이유

첫 리롤은 사실상 모든 방문자가 누른다. 그래서 `roll`을 Activation으로 잡으면
Acquisition과 거의 같은 숫자가 나와 퍼널이 아무것도 걸러내지 못한다. 대신
**`activate`의 `ms`(첫 리롤까지 걸린 시간)** 로 잡는다. 이 값이 길면 첫 화면 설명이
길다는 뜻이고, `visit`은 있는데 `activate`가 없으면 버튼조차 누르지 않고 떠난 것이다.

### 수집 백엔드 (자체 수집)

외부 스크립트 0개. 이벤트는 같은 도메인의 `POST /api/track`으로 가서
[server/counter.js](server/counter.js)가 JSONL 한 줄로 append한다.

```
브라우저          track() → 메모리 큐 → (3초 유휴 | pagehide) → sendBeacon
nginx             /api/ → 127.0.0.1:1558
counter.js        POST /api/track → events.jsonl 에 한 줄씩 append
```

**지연 0 규약** (리롤 체감을 지키는 유일한 이유):

- 클릭 경로에서 하는 일은 **큐에 push하는 것뿐**이다. 전송은 유휴/이탈 시점에 몰아서 한다
- `await` 없음. `navigator.sendBeacon`만 쓰고 응답을 보지 않는다. 전송 실패는 무시한다
- `exit`·마지막 `dwell`은 `pagehide` 때만 존재하므로 그 시점에 반드시 `flushEvents()`
- 큐는 500개에서 오래된 것부터 버린다 (전송이 계속 실패해도 메모리가 안 샌다)

**`ref`/`vin`/`v` 각인은 `track()` 안에서 끝난다.** 큐에는 각인된 뒤의 이벤트가 들어간다.
큐 어댑터를 손볼 때 이 순서를 깨면 `vin`이 사라지고, 그러면 문구 A/B를 영영 못 읽는다
(조용히 실패하므로 눈치채기 어렵다).

**개인정보**: 원 IP는 저장하지 않는다. `CF-Connecting-IP`를 **매일 바뀌는 랜덤 솔트**로
해시해 `ip_h`로만 남긴다 → "오늘의 고유 방문자"는 세지만 어제와는 이어붙일 수 없다.

**레이트리밋**: `/api/track`은 배치라 counter와 트래픽 모양이 다르다(한 번에 최대 50개,
pagehide 때 몰림). nginx의 counter용 `limit_req` 존을 그대로 쓰면 정상 배치가 503으로
잘리므로, counter.js가 **IP 해시당 분당 240개**로 자체 제한한다
(`TRACK_RATE_PER_MIN`). 한 IP의 도배가 다른 사용자를 막지 않는다.

배포 후 확인:

```bash
tail -f /var/lib/life-reroll/events.jsonl    # 리롤 2~3회 → visit/roll/dwell이 쌓이는지
```

### 지표 보기

[tools/analyze.py](tools/analyze.py)가 `events.jsonl`을 읽어 AARRR 퍼널을 한 번에 뽑는다.
의존성 없음(표준 라이브러리만) — VM에 jq나 pip 없이도 돈다.

```bash
# VM에서 바로
python3 tools/analyze.py                      # /var/lib/life-reroll/events.jsonl 자동 탐색
python3 tools/analyze.py --since 2026-07-18   # 그 날짜부터만
python3 tools/analyze.py --suggests           # 사용자 제안 전문까지

# 로컬에서 보려면 파일만 내려받아서
scp camp-15:/var/lib/life-reroll/events.jsonl .
python3 tools/analyze.py events.jsonl
```

출력에 들어가는 것: 채널별 유입(`ref`) · 활성화율과 첫 리롤까지 걸린 시간 ·
세션당 리롤 수 · 바이럴 계수 · 문구 A/B(`vin`) · 희귀도 구간별 체류 시간 ·
공유가 터진 나라 · 제안 전문.

읽을 때 주의할 것을 도구가 직접 말해 준다:

- 표본이 30건 미만이면 **A/B 승자를 정하지 말라고** 경고한다
- 희귀도별 체류 시간에는 **연출 교란 경고**가 붙는다 (아래 참조)
- `ip_h`가 1개로 뭉쳐 있으면 **nginx가 `CF-Connecting-IP`를 안 넘긴다는 신호**라고 알려 준다
- 배포 점검용 합성 이벤트(`probe` 등)는 기본으로 빼고 센다 (`--keep-test`로 포함)

### 외부 도구를 쓸 경우 (선택)

`index.html` 맨 아래 주석 위치에 GA4 / PostHog / Plausible 스니펫을 붙이면 `track()`이
전역 객체를 감지해 **자체 수집과 병행**해서 보낸다. 스니펫이 없으면 전부 no-op이라
앱은 그대로 동작한다. 단, 붙일 거면 반드시 `defer` + 첫 페인트 이후 로드 —
외부 스크립트를 크리티컬 패스에 넣지 않는다.

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

> **GitHub Pages는 쓰지 않는다.** 배포 대상은 위의 VM 하나뿐이다.
>
> 카운터와 계측이 동작하는 건 **이 VM이 `/api/`를 서빙하기 때문**이다. Pages는 정적
> 파일만 올릴 수 있어 `counter.js`(node 프로세스)를 돌릴 수 없다. 즉 **Pages로 가면**
> `/api/counter`·`/api/track`이 전부 404가 되고 "모두의 환생 횟수"와 모든 계측이 죽는다.
> 계측을 유지하려면 VM이어야 한다는 뜻이고, 그래서 Pages 워크플로와 `CNAME`을 제거했다
> (`CNAME`은 Pages 전용 규약이라 nginx·Cloudflare는 읽지 않는다).

## 데이터 출처와 한계

인구·도시화율·기대수명·1인당 GDP는 UN World Population Prospects 2024,
세계은행 등 공개 통계 기반 **근사치**를 코드에 내장했다 ([index.html](index.html)의 `RAW` 배열).
종교 분포는 국가 대표값이고, 연 소득(USD)은 1인당 GDP에 로그정규 편차를 더한
추정이라 실제 개인 소득이 아니다. 오락용이며 학술적 정확성을 보장하지 않는다.

개선 이력과 다음 실험 후보는 [IMPROVEMENT_LOG.md](IMPROVEMENT_LOG.md)에 기록한다.
