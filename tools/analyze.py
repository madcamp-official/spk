#!/usr/bin/env python3
"""events.jsonl 을 읽어 AARRR 퍼널을 한 번에 출력한다.

의존성 없음(표준 라이브러리만). VM에서 바로 돌리거나, 파일을 내려받아 로컬에서 돌린다.

    python3 tools/analyze.py                      # 기본 경로 자동 탐색
    python3 tools/analyze.py events.jsonl
    python3 tools/analyze.py --since 2026-07-17   # 그 날짜부터
    python3 tools/analyze.py --suggests           # 사용자 제안 전문까지

지표 정의는 README "수집 이벤트 (AARRR 매핑)" 를 따른다.
"""
import argparse
import collections
import json
import os
import re
import statistics
import sys

DEFAULT_PATHS = [
    "/var/lib/life-reroll/events.jsonl",
    "./events.jsonl",
]
# 배포 점검용으로 쏜 합성 이벤트. 사람이 아니므로 기본으로 제외한다.
TEST_EVENTS = {"probe", "test", "captest", "rltest", "singletest", "iptest", "flood", "innocent"}


def find_file(given):
    if given:
        return given
    for p in DEFAULT_PATHS:
        if os.path.exists(p):
            return p
    sys.exit("events.jsonl 을 찾지 못했습니다. 경로를 인자로 주세요.\n"
             "  예: python3 tools/analyze.py /var/lib/life-reroll/events.jsonl")


def load(path, since=None, keep_test=False):
    rows, bad = [], 0
    try:
        f = open(path, encoding="utf-8")
    except OSError as e:
        sys.exit(f"열 수 없습니다: {e}")
    with f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            try:
                ev = json.loads(line)
                ev["_day"] = day_of(ev.get("t", 0))
            except Exception:
                bad += 1
                continue
            if not keep_test and ev.get("e") in TEST_EVENTS:
                continue
            if since and ev["_day"] < since:
                continue
            rows.append(ev)
    return rows, bad


# 사용자가 한국에 있으므로 하루의 경계는 KST 자정이어야 한다. UTC로 끊으면 경계가
# 오전 9시가 되어, 새벽 0~9시 활동이 전날로 잡히고 고유 방문자 집계가 한창 쓰는 시간에 리셋된다.
# server/counter.js 의 솔트 회전과 반드시 같은 기준을 써야 한다 — 어긋나면 한 버킷 안에
# 서로 다른 솔트의 해시가 섞여 고유 방문자가 부풀려진다.
KST = __import__("datetime").timezone(__import__("datetime").timedelta(hours=9))


def day_of(ms):
    import datetime
    try:
        return datetime.datetime.fromtimestamp(ms / 1000, KST).strftime("%Y-%m-%d")
    except Exception:
        return "?"


def by(rows, name):
    return [r for r in rows if r.get("e") == name]


def prop(r, k, default=None):
    return (r.get("p") or {}).get(k, default)


def med(vals):
    return statistics.median(vals) if vals else 0


def pct(a, b):
    return f"{a/b*100:.0f}%" if b else "—"


def bar(n, total, width=24):
    if not total:
        return ""
    return "█" * max(1, round(n / total * width)) if n else ""


def h(title):
    print(f"\n\033[1m{title}\033[0m" if sys.stdout.isatty() else f"\n{title}")
    print("─" * 58)


def load_changes():
    """IMPROVEMENT_LOG.md 표에서 (날짜, 개선 요약)을 뽑는다. 지표가 움직인 날짜와
    그날 배포된 변경을 대조하기 위해서다 — 로그가 없거나 형식이 달라도 조용히 넘어간다."""
    p = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "IMPROVEMENT_LOG.md")
    out = []
    try:
        with open(p, encoding="utf-8") as f:
            for line in f:
                c = [x.strip() for x in line.split("|")]
                if len(c) >= 6 and re.match(r"^\d{4}-\d{2}-\d{2}$", c[2]):
                    out.append((c[2], c[4]))
    except OSError:
        pass
    return out


def main():
    ap = argparse.ArgumentParser(description="환생 시뮬레이터 AARRR 퍼널")
    ap.add_argument("file", nargs="?", help="events.jsonl 경로")
    ap.add_argument("--since", help="YYYY-MM-DD 이후만")
    ap.add_argument("--suggests", action="store_true", help="사용자 제안 전문 출력")
    ap.add_argument("--keep-test", action="store_true", help="합성 테스트 이벤트도 포함")
    a = ap.parse_args()

    path = find_file(a.file)
    rows, bad = load(path, a.since, a.keep_test)

    print(f"\n파일: {path}")
    if not rows:
        print("이벤트가 없습니다. /api/track 이 배포됐는지, 리롤을 해 봤는지 확인하세요.")
        return
    days = sorted({r["_day"] for r in rows})
    print(f"이벤트 {len(rows):,}개 · {days[0]} ~ {days[-1]} ({len(days)}일)"
          + (f" · 깨진 줄 {bad}개 건너뜀" if bad else ""))

    visits = by(rows, "visit")
    acts = by(rows, "activate")
    rolls = by(rows, "roll")
    dwells = by(rows, "dwell")
    exits = by(rows, "exit")
    # share_open 은 "공유 시트를 열었다"이지 공유가 아니다. 이걸 분모에 넣으면
    # 바이럴 계수가 실제의 절반으로 축소된다. 화이트리스트로 거른다 — startswith("share_")는
    # 나중에 share_ 로 시작하는 무관한 이벤트가 생기면 조용히 섞여 들어간다.
    SHARE_SENT = {"share_text", "share_kakao", "share_insta", "share_x", "share_native", "share_card"}
    shares = [r for r in rows if r.get("e") in SHARE_SENT]
    share_opens = by(rows, "share_open")
    fortunes = by(rows, "fortune")
    dex = by(rows, "collection_open")
    suggests = by(rows, "suggest")
    reaches = by(rows, "reach")

    # ---------- 오늘의 병목 ----------
    # 각 단계를 기준치와 비교해 가장 뒤처진 단계 하나를 지목한다. 기준치는 목표가 아니라
    # "이보다 낮으면 이 단계부터 본다"는 트리아지 선(가설)이다 — 데이터가 쌓이면 갱신할 것.
    # 하루에 한 단계만 고친다. 같은 날 두 개를 고치면 KST 일 버킷 비교로 귀속이 안 된다.
    h("오늘의 병목 — 어디부터 고칠까")
    from_share_v = [r for r in visits if prop(r, "ref") == "share"]
    from_share_a = [r for r in acts if prop(r, "ref") == "share"]
    stages = [
        ("활성화", "visit → activate", len(acts), len(visits), 0.50,
         "첫 화면 문구·버튼 (ms_to_first_roll도 같이 볼 것)"),
        ("공유의도", "activate → share_open", len(share_opens), len(acts), 0.15,
         "결과 화면의 공유 유도 — 연출·버튼 위치"),
        ("공유완료", "share_open → share", len(shares), len(share_opens), 0.50,
         "공유 시트 채널 구성 (kakao 톡공유 키가 아직 없다)"),
        ("확산", "share → ref=share 유입", len(from_share_v), len(shares), 0.50,
         "공유 문구(vin A/B)·링크 미리보기(OG)"),
        ("수신활성화", "ref=share visit → activate", len(from_share_a), len(from_share_v), 0.50,
         "공유받은 화면의 '나도 환생해 보기' CTA"),
    ]
    worst = None
    for name, label, n, d, target, fix in stages:
        if d < 10:
            print(f"  {name:<6} {label:<28} {n}/{d}  (표본<10 — 판단 보류)")
            continue
        r = n / d
        mark = "✅" if r >= target else "⚠"
        print(f"  {name:<6} {label:<28} {r*100:4.0f}%  (기준 {target*100:.0f}%) {mark}")
        if r < target and (worst is None or r / target < worst[0]):
            worst = (r / target, name, fix)
    if worst:
        print(f"\n  → 오늘 고칠 곳: {worst[1]} — {worst[2]}")
    else:
        print("\n  → 기준 미달 단계 없음. 표본이 부족한 단계부터 트래픽을 모으세요.")

    # ---------- ACQUISITION ----------
    h("ACQUISITION · 획득")
    # ip_h 의 솔트는 매일 바뀐다. 그래서 고유 방문자는 "그날 안에서만" 셀 수 있고,
    # 전체 기간 distinct 는 같은 사람을 날마다 새로 세는 셈이라 쓰면 안 된다.
    uniq_by_day = {d: len({r["ip_h"] for r in visits if r["_day"] == d and "ip_h" in r}) for d in days}
    print(f"  visit {len(visits):,}건")
    print(f"  일별 고유 방문자(ip_h): " + " · ".join(f"{d[5:]} {uniq_by_day.get(d,0)}" for d in days))
    print("    ↑ 솔트가 매일 바뀌므로 날짜별로만 셉니다. 기간 합계는 같은 사람을 중복해 셉니다.")

    # 지표가 움직인 날짜에 무엇이 배포됐는지. 같은 날 두 개가 나갔다면 그 움직임은 귀속 불가.
    changed = collections.defaultdict(list)
    for d, s in load_changes():
        if days[0] <= d <= days[-1]:
            changed[d].append(s)
    if changed:
        print("\n  그날 배포된 것 (IMPROVEMENT_LOG.md)")
        for d in sorted(changed):
            items = changed[d]
            for s in items[:3]:
                print(f"    {d}  {s[:52]}{'…' if len(s) > 52 else ''}")
            if len(items) > 3:
                print(f"    {d}  … 외 {len(items)-3}건 (같은 날 여러 건 = 지표 변화 귀속 불가)")

    # 모든 방문이 한 해시로 뭉쳤다면 IP 복원이 깨진 것이다. nginx가 CF-Connecting-IP 를
    # 넘기지 않으면 터널 뒤라 전부 127.0.0.1 로 보여 방문자가 영원히 1이 되고,
    # 게다가 IP당 레이트리밋이 전체 사용자를 한 바구니에 넣어 버린다.
    all_hashes = {r.get("ip_h") for r in rows if r.get("ip_h")}
    if len(visits) >= 5 and len(all_hashes) == 1:
        print("\n    ⚠ 방문 5건 이상인데 ip_h 가 1개뿐입니다.")
        print("      nginx 가 CF-Connecting-IP 를 넘기지 않으면 이렇게 됩니다 (server/DEPLOY.md 2번).")
        print("      이 상태면 고유 방문자를 셀 수 없고, 레이트리밋이 전체를 한 IP로 묶습니다.")

    # 채널(ref)별 획득 — 방문 수만이 아니라 그 채널이 데려온 사람이 활성화·공유까지
    # 갔는지 함께 본다. reddit·instagram 같은 외부 채널을 "양"이 아니라 "질"로 비교하기 위해서다.
    # ref 는 첫 유입값이 기기에 각인되므로(track.js) 한 기기의 visit·activate·share 는 같은
    # ref 를 달고 나온다 — 그래서 이벤트를 종류별로 세어도 같은 채널로 묶인다(첫 유입 기준 귀속).
    ch_visit = collections.Counter(prop(r, "ref", "?") for r in visits)
    ch_act = collections.Counter(prop(r, "ref", "?") for r in acts)
    ch_share = collections.Counter(prop(r, "ref", "?") for r in shares)
    if ch_visit:
        print("\n  유입 채널 (ref) — 방문 → 활성화 → 공유")
        print(f"    {'채널':<12}{'방문':>6}{'활성화':>9}{'공유':>8}")
        for name, n in ch_visit.most_common():
            av = pct(ch_act.get(name, 0), n)
            sv = pct(ch_share.get(name, 0), n)
            print(f"    {name:<12}{n:>6}{av:>9}{sv:>8}  {bar(n, len(visits))}")
        print("    ↑ 활성화·공유는 각 채널 방문 대비 비율. 낮으면 그 채널이 데려온 사람이 겉돕니다.")
        if list(ch_visit) == ["direct"]:
            print("    ⚠ 전부 direct 입니다. 홍보 링크에 ?ref= 를 붙이지 않으면 채널 성과를 못 잽니다.")

    # ---------- ACTIVATION ----------
    h("ACTIVATION · 활성화")
    print(f"  activate {len(acts):,}건 / visit {len(visits):,}건 = {pct(len(acts), len(visits))}")
    print(f"    ↑ activate 가 없는 visit = 환생 버튼조차 안 눌러 본 이탈")
    ms = [prop(r, "ms", 0) for r in acts if isinstance(prop(r, "ms"), (int, float))]
    if ms:
        print(f"  첫 리롤까지 median {med(ms)/1000:.1f}초 (p90 {sorted(ms)[int(len(ms)*0.9)-1]/1000:.1f}초)")
        print(f"    ↑ 길어지면 첫 화면 설명이 길다는 뜻")
    ret = [r for r in acts if prop(r, "returning") is True]
    if acts:
        print(f"  재방문자 비율 {pct(len(ret), len(acts))} ({len(ret)}/{len(acts)})")

    # ---------- RETENTION ----------
    h("RETENTION · 리텐션")
    # days_since_first 는 기기가 "첫 방문으로부터 며칠째"인지 스스로 신고한 값이다.
    # ip_h 는 솔트가 매일 갈려 날짜를 넘겨 이어붙일 수 없으므로(의도) 이것만이 리텐션의 근거다.
    known = [(r, prop(r, "days_since_first")) for r in visits
             if isinstance(prop(r, "days_since_first"), (int, float))]
    if known:
        newv = [r for r, d in known if d == 0]
        retv = [r for r, d in known if d >= 1]
        miss = len(visits) - len(known)
        print(f"  visit 중 신규(0일째) {len(newv)} · 재방문(1일 이상) {len(retv)}"
              + (f" · 미계측 {miss} (계측 배포 전 클라)" if miss else ""))
        # D1 = 어제 처음 온 기기가 오늘 다시 왔는가. 신원을 잇는 게 아니라(솔트 때문에 불가능)
        # "d일에 dsf=0인 수" 대 "d+1일에 dsf=1인 수"를 비교한다. 같은 날 중복 방문은 ip_h로 접는다.
        for i in range(len(days) - 1):
            d0, d1 = days[i], days[i + 1]
            cohort = {r.get("ip_h") for r, d in known if r["_day"] == d0 and d == 0}
            back = {r.get("ip_h") for r, d in known if r["_day"] == d1 and d == 1}
            if cohort:
                print(f"  D1 {d0} 신규 {len(cohort)}명 → 이튿날 복귀 {len(back)}명 = {pct(len(back), len(cohort))}")
        # 운세가 재방문 고리인가. 신규 방문의 used_fortune 은 거의 항상 false다(visit 이
        # 로드 시점에 발화하니 아직 써 볼 틈이 없다). 그래서 비교 기준선은 visit 이 아니라
        # "신규 기기 중 운세를 한 번이라도 써 본 비율"(fortune first=true ÷ 신규 수)로 잡는다.
        uf = [(r, d) for r, d in known if isinstance(prop(r, "used_fortune"), bool)]
        rets = [r for r, d in uf if d >= 1]
        first = [r for r in fortunes if prop(r, "first") is True]
        new_dev = len({(r["_day"], r.get("ip_h")) for r, d in uf if d == 0})
        if rets and new_dev:
            f_ret = len([r for r in rets if prop(r, "used_fortune")])
            print(f"  재방문 visit 중 운세 써 본 기기 {pct(f_ret, len(rets))}"
                  f" · 신규 기기 중 운세 사용률 {pct(min(len(first), new_dev), new_dev)}")
            print("    ↑ 왼쪽이 오른쪽보다 뚜렷이 높으면 운세가 재방문 고리로 작동한다는 신호.")
            print("      (상관이지 인과는 아님 — 애초에 몰입한 사람이 운세도 씁니다)")
    else:
        first = [r for r in fortunes if prop(r, "first") is True]
        print("  days_since_first 없음 — 리텐션 계측(2026-07-18) 배포 후부터 쌓입니다.")
    print(f"  fortune {len(fortunes):,}건 (그중 first=true {len(first)} = 그날의 첫 방문)")
    print(f"  도감 열기 {len(dex):,}건")
    if exits:
        rr = [prop(r, "rolls", 0) for r in exits]
        print(f"  세션당 리롤 median {med(rr):.0f}회 · 평균 {sum(rr)/len(rr):.1f}회 (n={len(rr)})")
        one = len([x for x in rr if x <= 1])
        print(f"    1회 이하로 떠난 세션 {pct(one, len(rr))} — 높으면 한 번 뽑고 흥미 상실")

    # ---------- REFERRAL ----------
    h("REFERRAL · 추천")
    # share_open 은 "공유 시트를 열었다"일 뿐 아직 공유가 아니다. 분모에 넣으면
    # 열어만 보고 닫은 사람까지 공유자로 세어 바이럴 계수가 실제보다 낮게 나온다.
    print(f"  공유 시트 열기 {len(share_opens):,}건 → 실제 공유 {len(shares):,}건"
          f" (완료율 {pct(len(shares), len(share_opens))})")
    if share_opens and len(shares) < len(share_opens) * 0.5:
        print("    ↑ 열어 놓고 절반 이상이 그냥 닫습니다. 채널 목록이 기대와 다른지 보세요")
    kinds = collections.Counter(r["e"] for r in shares)
    print("  " + (" · ".join(f"{k.replace('share_','')} {v}" for k, v in kinds.most_common()) or "(공유 없음)"))
    from_share = [r for r in visits if prop(r, "ref") == "share"]
    print(f"  ref=share 유입 {len(from_share):,}건")
    if shares:
        print(f"  바이럴 계수 = 유입 ÷ 실제 공유 = {len(from_share)/len(shares):.2f}")
        print("    ↑ 1을 넘으면 공유 한 번이 한 명 넘게 데려온다는 뜻")

    # 채널별 바이럴 계수. via 는 링크에 실려 오므로 "그 채널이 실제로 데려온 수"다.
    # 인스타·카드 저장은 링크가 아니라 이미지만 나가므로 유입이 0으로 잡히는 게 정상이다
    # (카드에 QR을 넣기 전까지는 스토리 유입이 direct 로 새어 들어간다).
    CH = [("kakao", "share_kakao", "카카오톡"), ("x", "share_x", "X"),
          ("native", "share_native", "다른 앱"), ("clip", "share_text", "클립보드"),
          ("insta", "share_insta", "인스타(이미지)"), ("card", "share_card", "카드저장(이미지)")]
    sent = collections.Counter(r["e"] for r in shares)
    got = collections.Counter(prop(r, "via", "none") for r in visits)
    print("\n  채널별 (공유 발생 → 그 링크로 들어온 수)")
    print(f"    {'채널':<14}{'공유':>5}{'유입':>7}{'계수':>8}")
    for via, ev, label in CH:
        s, g = sent.get(ev, 0), got.get(via, 0)
        if not s and not g:
            continue
        k = f"{g/s:.2f}" if s else "—"
        note = ""
        if via in ("insta", "card") and s:
            note = "  ← 링크 없음(이미지만). QR 넣기 전엔 유입 추적 불가"
        print(f"    {label:<14}{s:>5}{g:>7}{k:>8}{note}")
    legacy = got.get("none", 0) - len([r for r in visits if prop(r, "ref") != "share"])
    if legacy > 0:
        print(f"    via 없는 share 유입 {legacy}건 — via 태깅 배포 전에 뿌려진 옛 링크")

    # 문구 A/B 는 반드시 vin 으로 읽는다 (v 는 그 기기가 공유할 때 쓸 문구라 유입과 무관)
    vin = collections.Counter(prop(r, "vin", "none") for r in visits)
    a_n, b_n = vin.get("a", 0), vin.get("b", 0)
    print(f"\n  문구 A/B (vin — 나를 데려온 문구)")
    print(f"    a 스토리형  {a_n:>5}  {bar(a_n, max(a_n+b_n,1))}")
    print(f"    b 성과형    {b_n:>5}  {bar(b_n, max(a_n+b_n,1))}")
    if a_n + b_n == 0:
        print("    아직 공유 유입이 없습니다.")
    elif a_n + b_n < 30:
        print(f"    ⚠ 표본 {a_n+b_n}건. 아직 승자를 정하지 마세요 (최소 30건 권장).")
    else:
        win = "a 스토리형" if a_n > b_n else "b 성과형"
        print(f"    → 현재 우세: {win}")

    # ---------- 결과 만족도 ----------
    h("반응 · 결과별 체류 시간 (dwell)")
    # reason 별로 나눠 본다. reroll/fortune 은 사용자가 "돌아와서" 뭔가 한 dwell이라
    # 진짜 몰입을 반영한다. exit 은 떠나며 닫힌 것, idle 은 자리를 비워 idle 타이머가 닫은 것 —
    # 둘은 신뢰도가 낮은 쪽이다. (idle 은 마지막 상호작용+20초에서 잘려 부풀지 않는다.)
    dwell_reason = collections.Counter(prop(r, "reason", "?") for r in dwells)
    if dwells:
        print("  이유별 dwell: " + " · ".join(
            f"{k} {v}" for k, v in dwell_reason.most_common()))
        print("    ↑ reroll·fortune=돌아와 행동한 신뢰 dwell · exit·idle=떠남/자리 비움(신뢰 낮음)")
    # 희귀도 비교는 "돌아와 행동한" dwell(reroll·fortune)로만 한다 — exit·idle 이 섞이면
    # 자리 비움 시간이 만족도로 오독된다. idle 은 캡이 걸려도 애초에 몰입 신호가 아니다.
    trusted = [r for r in dwells if prop(r, "reason") in ("reroll", "fortune")]
    buckets = collections.OrderedDict([(">=1% 흔함", []), ("0.1–1%", []), ("<0.1% 희귀", [])])
    for r in trusted:
        p = prop(r, "prob", 0) or 0
        ms_ = prop(r, "ms", 0)
        k = ">=1% 흔함" if p >= 1 else ("0.1–1%" if p >= 0.1 else "<0.1% 희귀")
        buckets[k].append(ms_)
    print(f"\n  희귀도별 median (reroll·fortune dwell만, n={len(trusted)})")
    for k, v in buckets.items():
        if v:
            print(f"    {k:<12} n={len(v):<5} median {med(v):>6.0f}ms")
        else:
            print(f"    {k:<12} n=0")
    print("\n  ⚠ 희귀도별 비교는 그대로 믿지 마세요. 희귀한 생은 배지가 하나 더 붙고")
    print("    컨페티가 약 4.3초 재생돼서, 재미와 무관하게 체류가 길게 나옵니다.")
    print("    → 신뢰할 수 있는 건 '짧은 쪽'입니다. 0.5초대면 아무것도 안 읽고 떠난 것.")

    fast = [r for r in dwells if (prop(r, "ms", 0) or 0) < 800]
    if dwells:
        print(f"  0.8초 미만으로 떠난 생 {pct(len(fast), len(dwells))} ({len(fast)}/{len(dwells)})")

    # roll_idx: 세션 안 몇 번째 리롤을 들여다본 dwell인가. 초반(신기함)과 후반(익숙/자리비움)의
    # dwell을 나눠, 긴 dwell이 몰입인지 방치인지 가른다. 남의 생(roll_idx=0)은 뺀다.
    with_idx = [prop(r, "roll_idx") for r in dwells
                if isinstance(prop(r, "roll_idx"), (int, float)) and prop(r, "roll_idx") >= 1]
    if with_idx:
        early = [r for r in trusted if (prop(r, "roll_idx") or 0) in (1, 2, 3)]
        late = [r for r in trusted if (prop(r, "roll_idx") or 0) >= 10]
        e_ms = [prop(r, "ms", 0) for r in early]
        l_ms = [prop(r, "ms", 0) for r in late]
        if e_ms or l_ms:
            print(f"  초반(1–3번째) median {med(e_ms):.0f}ms (n={len(e_ms)})"
                  f" · 후반(10번째~) median {med(l_ms):.0f}ms (n={len(l_ms)})")
            print("    ↑ 후반이 초반보다 길면 자리 비움(idle) 의심, 짧으면 흥미가 식은 것")

    shared = [r for r in dwells if prop(r, "shared") is True]
    if shared:
        print(f"\n  공유까지 간 생 {len(shared)}건 — 공유가 터지는 결과 유형")
        cc = collections.Counter(prop(r, "country", "?") for r in shared)
        for name, n in cc.most_common(8):
            print(f"    {name:<14} {n}")

    # ---------- 몰입 · 리롤 리듬 ----------
    h("몰입 · 리롤 리듬 (roll)")
    # quick = 직전 리롤로부터 1초도 안 돼 다시 굴린 것. 아무것도 안 읽고 넘긴 리롤이다.
    # 높으면 결과를 "읽는" 게 아니라 "넘기며" 뭔가를 찾는 것(희귀도 사냥 등).
    quicks = [r for r in rolls if prop(r, "quick") is True]
    have_quick = [r for r in rolls if isinstance(prop(r, "quick"), bool)]
    if have_quick:
        print(f"  1초 미만 즉시 리롤 {pct(len(quicks), len(have_quick))} ({len(quicks)}/{len(have_quick)})")
        # 즉시 리롤이 흔한 결과에 몰리고 희귀한 결과는 오래 보면 = 희귀도 사냥의 신호.
        qr = collections.Counter()
        qd = collections.Counter()
        for r in have_quick:
            p = prop(r, "prob", 0) or 0
            k = ">=1% 흔함" if p >= 1 else ("0.1–1%" if p >= 0.1 else "<0.1% 희귀")
            qd[k] += 1
            if prop(r, "quick") is True:
                qr[k] += 1
        for k in (">=1% 흔함", "0.1–1%", "<0.1% 희귀"):
            if qd[k]:
                print(f"    {k:<12} 즉시 리롤율 {pct(qr[k], qd[k])} ({qr[k]}/{qd[k]})")
        print("    ↑ 흔한 결과일수록 즉시 리롤율이 높으면 '희귀한 나라를 찾아 넘기는' 사냥 패턴")
    # since_prev_ms: 리롤 간격 중앙값 = 결과 하나를 소비하는 평균 리듬.
    gaps = [prop(r, "since_prev_ms") for r in rolls
            if isinstance(prop(r, "since_prev_ms"), (int, float)) and (prop(r, "idx") or 0) > 1]
    if gaps:
        print(f"  리롤 간격 median {med(gaps)/1000:.1f}초 (n={len(gaps)})")
    # roll_idx 분포: 리롤이 몇 번째까지 이어지는가 = 몰입이 꺾이는 지점(세션당 median은 리텐션에).
    idxs = [prop(r, "idx") for r in rolls if isinstance(prop(r, "idx"), (int, float))]
    if idxs:
        deep = len([x for x in idxs if x >= 10])
        print(f"  10번째 이후까지 이어진 리롤 {pct(deep, len(idxs))} · 관측된 최고 번호 {max(idxs)}")

    # ---------- 스크롤 깊이 ----------
    if reaches:
        h("스크롤 깊이 · 어디까지 내려 보나 (reach)")
        # 히어로 아래로 내려간 사람만 reach를 낸다. activate(첫 리롤) 대비 비율로 읽는다.
        rc = collections.Counter(prop(r, "section", "?") for r in reaches)
        base = len(acts) or len(visits)
        label = "activate" if acts else "visit"
        for sec, lbl in [("odds", "확률표"), ("suggest", "제안함"), ("footer", "푸터")]:
            n = rc.get(sec, 0)
            print(f"  {lbl:<6} {n:>5}  {label} 대비 {pct(n, base)}  {bar(n, base)}")
        print(f"    ↑ 확률표까지도 안 내려가면(비율 낮음) 결과·버튼 아래는 사실상 안 보입니다")
        # 안 굴리고 훑기만 한 사람: reach인데 rolls_so_far=0.
        browse = [r for r in reaches if prop(r, "rolls_so_far") == 0]
        if browse:
            bc = collections.Counter(prop(r, "section", "?") for r in browse)
            print("  안 굴리고 스크롤만: " + " · ".join(f"{k} {v}" for k, v in bc.most_common()))

    # ---------- 직접 의견 ----------
    h("직접 의견 · 한 줄 제안")
    print(f"  suggest {len(suggests):,}건")
    if suggests and not a.suggests:
        print("  전문을 보려면: --suggests")
    if a.suggests:
        for r in suggests:
            print(f"    [{r['_day']}] {prop(r, 'text', '')}")

    # ---------- 결과 분포 ----------
    if rolls:
        h("결과 분포 (roll)")
        cc = collections.Counter(prop(r, "country", "?") for r in rolls)
        print(f"  총 {len(rolls):,}회 · 서로 다른 나라 {len(cc)}개")
        for name, n in cc.most_common(8):
            print(f"    {name:<14} {n:>5}  {bar(n, len(rolls))}")

    print()


if __name__ == "__main__":
    main()
