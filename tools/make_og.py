# -*- coding: utf-8 -*-
"""OG 공유 썸네일(1200x630) 생성 스크립트 — 다국어.

Reddit·해외 커뮤니티에 뿌릴 때 언어별 미리보기 배너가 필요하다.
카톡/디스코드/트위터/페북 링크 미리보기(og:image)에 그대로 쓰인다.

  기본(한국어) : og-image.png
  그 외        : og-image-en.png / -ja.png / -zh.png / -es.png / -pt.png

실행:
  pip install pillow                      # (VM엔 python3-pil 설치돼 있음)
  sudo apt install fonts-noto-cjk         # 한·일·중 글리프
  python3 tools/make_og.py                # 전부 생성
  python3 tools/make_og.py en ja          # 일부만 생성

숫자는 packages/core 의 인구 분포에서 실제로 계산한 값이다(198개국, 합계 81억).
  인도 17.9% · 중국 17.5% · 미국 4.2% · 일본 1.5% · 멕시코 1.6% · 브라질 2.6% · 모나코 1/207,000
"""
import random
import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

W, H = 1200, 630
VOID = (10, 13, 28)
SURFACE = (20, 26, 51)
INK = (236, 233, 245)
MUTED = (154, 152, 181)
GOLD = (243, 201, 92)

TIERS = [
    ("N", (152, 160, 184)),
    ("R", (111, 177, 232)),
    ("SR", (183, 142, 240)),
    ("SSR", (243, 201, 92)),
    ("UR", (255, 143, 178)),
]

# Noto Sans CJK 한 파일(.ttc) 안에 지역별 face가 들어 있다 — 한자 글자체가
# 언어마다 다르므로(예: 中國 vs 中国 vs 日本식 한자) 언어에 맞는 index를 골라야 한다.
#   0=JP  1=KR  2=SC  3=TC  4=HK   (fc-list / getname 으로 확인함)
CJK = "/usr/share/fonts/opentype/noto/NotoSansCJK-{weight}.ttc"
FACE = {"ko": 1, "ja": 0, "zh": 2, "en": 1, "es": 1, "pt": 1}  # 라틴 문자는 어느 face든 동일

# 언어별 문구. 브랜드 눈썹줄(SAMSARA SIMULATOR)과 등급 알약(N R SR SSR UR)은 공용.
LANGS = {
    "ko": dict(
        out="og-image.png",
        title="환생 시뮬레이터",
        tagline="당신의 다음 생은 어디에서 시작될까요?",
        subtitle="실제 지구 인구 분포 확률 그대로, 198개국 환생 뽑기",
        stat="인도 17.9% · 중국 17.5% · 대한민국 0.64% · 모나코 1/207,000",
    ),
    "en": dict(
        out="og-image-en.png",
        title="Rebirth Simulator",
        tagline="Where will your next life begin?",
        subtitle="Real Earth population odds · reroll across 198 countries",
        stat="India 17.9% · China 17.5% · USA 4.2% · Monaco 1 in 207,000",
    ),
    "ja": dict(
        out="og-image-ja.png",
        title="輪廻転生シミュレーター",
        tagline="あなたの来世は、どこから始まる？",
        subtitle="実際の地球の人口分布そのまま · 198か国から転生ガチャ",
        stat="インド 17.9% · 中国 17.5% · 日本 1.5% · モナコ 20万分の1",
    ),
    "zh": dict(
        out="og-image-zh.png",
        title="转世模拟器",
        tagline="你的下一世，会从哪里开始？",
        subtitle="按真实地球人口分布概率 · 在198个国家转世抽卡",
        stat="印度 17.9% · 中国 17.5% · 美国 4.2% · 摩纳哥 二十万分之一",
    ),
    "es": dict(
        out="og-image-es.png",
        title="Simulador de Reencarnación",
        tagline="¿Dónde empezará tu próxima vida?",
        subtitle="Probabilidades reales de población · renace entre 198 países",
        stat="India 17.9% · China 17.5% · México 1.6% · Mónaco 1 entre 207.000",
    ),
    "pt": dict(
        out="og-image-pt.png",
        title="Simulador de Reencarnação",
        tagline="Onde vai começar sua próxima vida?",
        subtitle="Probabilidades reais da população · renasça entre 198 países",
        stat="Índia 17.9% · China 17.5% · Brasil 2.6% · Mônaco 1 em 207.000",
    ),
}

EYEBROW = "S A M S A R A   S I M U L A T O R"


def font(weight, size, face):
    path = CJK.format(weight="Bold" if weight == "bold" else "Regular")
    try:
        return ImageFont.truetype(path, size, index=face)
    except OSError as e:
        raise SystemExit(
            f"폰트를 못 찾음: {path}\n  → sudo apt install fonts-noto-cjk 로 설치하세요. ({e})"
        )


def lerp(a, b, t):
    return tuple(int(x + (y - x) * t) for x, y in zip(a, b))


def fit(d, text, weight, face, maxsize, minsize, maxw):
    """maxw 안에 들어가는 가장 큰 크기를 고른다. 언어마다 길이가 달라도 한 줄에 담긴다."""
    s = maxsize
    while s > minsize:
        f = font(weight, s, face)
        if d.textlength(text, font=f) <= maxw:
            return f
        s -= 2
    return font(weight, minsize, face)


def make(lang):
    spec = LANGS[lang]
    face = FACE[lang]
    random.seed(42)  # 별 배치를 모든 언어에서 동일하게
    img = Image.new("RGB", (W, H), VOID)
    d = ImageDraw.Draw(img)

    # 세로 그라데이션: void -> surface -> void
    for y in range(H):
        t = y / H
        c = lerp(VOID, SURFACE, t / 0.55) if t < 0.55 else lerp(SURFACE, VOID, (t - 0.55) / 0.45)
        d.line([(0, y), (W, y)], fill=c)

    # 별
    for _ in range(150):
        x, y = random.uniform(0, W), random.uniform(0, H)
        r = random.uniform(0.6, 2.0)
        a = random.uniform(0.25, 0.9)
        d.ellipse([x - r, y - r, x + r, y + r], fill=lerp(VOID, INK, a))

    def mid(text, f, cy, fill):
        d.text((W / 2, cy), text, font=f, fill=fill, anchor="mm")

    # 언어와 무관하게 세로 중심을 고정 → 폰트 크기가 달라도 리듬이 유지된다.
    mid(EYEBROW, font("bold", 22, 1), 104, GOLD)
    mid(spec["title"], fit(d, spec["title"], "bold", face, 96, 54, 1050), 192, GOLD)
    mid(spec["tagline"], fit(d, spec["tagline"], "bold", face, 40, 30, 1080), 300, INK)
    mid(spec["subtitle"], fit(d, spec["subtitle"], "regular", face, 28, 21, 1090), 362, MUTED)

    # 등급 알약 행 (공용)
    pill_f = font("bold", 26, 1)
    pad_x, pill_h, gap = 26, 52, 16
    widths = [d.textlength(k, font=pill_f) + pad_x * 2 for k, _ in TIERS]
    total = sum(widths) + gap * (len(TIERS) - 1)
    x = (W - total) / 2
    y = 435
    for (key, color), pw in zip(TIERS, widths):
        d.rounded_rectangle([x, y, x + pw, y + pill_h], radius=pill_h / 2, fill=color)
        tw = d.textlength(key, font=pill_f)
        d.text((x + (pw - tw) / 2, y + 10), key, font=pill_f, fill=VOID)
        x += pw + gap

    mid(spec["stat"], fit(d, spec["stat"], "regular", face, 26, 20, 1120), 560, GOLD)

    # 모노레포 전환 후 웹 산출물은 apps/web 에 있다(레포 루트가 아니다)
    out = Path(__file__).resolve().parent.parent / "apps" / "web" / spec["out"]
    img.save(out, "PNG")
    print(f"saved: {spec['out']:16s} ({out.stat().st_size // 1024} KB)  [{lang}]")


def main():
    langs = sys.argv[1:] or list(LANGS)
    for lang in langs:
        if lang not in LANGS:
            raise SystemExit(f"모르는 언어: {lang} (가능: {', '.join(LANGS)})")
        make(lang)


if __name__ == "__main__":
    main()
