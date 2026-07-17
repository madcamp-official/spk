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
    # share_open 은 시트를 연 것일 뿐이라 실제 공유와 분리한다 (바이럴 계수 분모가 달라진다)
    share_opens = by(rows, "share_open")
    shares = [r for r in rows if str(r.get("e", "")).startswith("share_") and r.get("e") != "share_open"]
    fortunes = by(rows, "fortune")
    dex = by(rows, "collection_open")
    suggests = by(rows, "suggest")

    # ---------- ACQUISITION ----------
    h("ACQUISITION · 획득")
    # ip_h 의 솔트는 매일 바뀐다. 그래서 고유 방문자는 "그날 안에서만" 셀 수 있고,
    # 전체 기간 distinct 는 같은 사람을 날마다 새로 세는 셈이라 쓰면 안 된다.
    uniq_by_day = {d: len({r["ip_h"] for r in visits if r["_day"] == d and "ip_h" in r}) for d in days}
    print(f"  visit {len(visits):,}건")
    print(f"  일별 고유 방문자(ip_h): " + " · ".join(f"{d[5:]} {uniq_by_day.get(d,0)}" for d in days))
    print("    ↑ 솔트가 매일 바뀌므로 날짜별로만 셉니다. 기간 합계는 같은 사람을 중복해 셉니다.")

    # 모든 방문이 한 해시로 뭉쳤다면 IP 복원이 깨진 것이다. nginx가 CF-Connecting-IP 를
    # 넘기지 않으면 터널 뒤라 전부 127.0.0.1 로 보여 방문자가 영원히 1이 되고,
    # 게다가 IP당 레이트리밋이 전체 사용자를 한 바구니에 넣어 버린다.
    all_hashes = {r.get("ip_h") for r in rows if r.get("ip_h")}
    if len(visits) >= 5 and len(all_hashes) == 1:
        print("\n    ⚠ 방문 5건 이상인데 ip_h 가 1개뿐입니다.")
        print("      nginx 가 CF-Connecting-IP 를 넘기지 않으면 이렇게 됩니다 (server/DEPLOY.md 2번).")
        print("      이 상태면 고유 방문자를 셀 수 없고, 레이트리밋이 전체를 한 IP로 묶습니다.")

    refs = collections.Counter(prop(r, "ref", "?") for r in visits)
    if refs:
        print("\n  유입 채널 (ref)")
        top = refs.most_common()
        for name, n in top:
            print(f"    {name:<12} {n:>5}  {bar(n, len(visits))}")
        if len(top) == 1 and top[0][0] == "direct":
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
    first = [r for r in fortunes if prop(r, "first") is True]
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
    kinds = collections.Counter(r["e"] for r in shares)
    if kinds:
        print("    " + " · ".join(f"{k.replace('share_','')} {v}" for k, v in kinds.most_common()))
    from_share = [r for r in visits if prop(r, "ref") == "share"]
    print(f"  ref=share 유입 {len(from_share):,}건")
    if shares:
        print(f"  바이럴 계수 = 유입 ÷ 실제 공유 = {len(from_share)/len(shares):.2f}")
        print("    ↑ 1을 넘으면 공유 한 번이 한 명 넘게 데려온다는 뜻")

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
    buckets = collections.OrderedDict([(">=1% 흔함", []), ("0.1–1%", []), ("<0.1% 희귀", [])])
    for r in dwells:
        p = prop(r, "prob", 0) or 0
        ms_ = prop(r, "ms", 0)
        k = ">=1% 흔함" if p >= 1 else ("0.1–1%" if p >= 0.1 else "<0.1% 희귀")
        buckets[k].append(ms_)
    for k, v in buckets.items():
        if v:
            print(f"  {k:<12} n={len(v):<5} median {med(v):>6.0f}ms")
        else:
            print(f"  {k:<12} n=0")
    print("\n  ⚠ 희귀도별 비교는 그대로 믿지 마세요. 희귀한 생은 배지가 하나 더 붙고")
    print("    컨페티가 약 4.3초 재생돼서, 재미와 무관하게 체류가 길게 나옵니다.")
    print("    → 신뢰할 수 있는 건 '짧은 쪽'입니다. 0.5초대면 아무것도 안 읽고 떠난 것.")

    fast = [r for r in dwells if (prop(r, "ms", 0) or 0) < 800]
    if dwells:
        print(f"  0.8초 미만으로 떠난 생 {pct(len(fast), len(dwells))} ({len(fast)}/{len(dwells)})")

    shared = [r for r in dwells if prop(r, "shared") is True]
    if shared:
        print(f"\n  공유까지 간 생 {len(shared)}건 — 공유가 터지는 결과 유형")
        cc = collections.Counter(prop(r, "country", "?") for r in shared)
        for name, n in cc.most_common(8):
            print(f"    {name:<14} {n}")

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
