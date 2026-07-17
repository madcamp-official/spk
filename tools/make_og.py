# -*- coding: utf-8 -*-
"""OG 공유 썸네일(og-image.png, 1200x630) 생성 스크립트.
카톡/인스타/디스코드 링크 미리보기에 쓰인다.

실행: pip install pillow && python tools/make_og.py
"""
import random
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

# 플랫폼별 한글 폰트 후보 (앞에서부터 존재하는 것 사용)
FONT_CANDIDATES = {
    "bold": [
        "C:/Windows/Fonts/malgunbd.ttf",                                  # Windows 맑은 고딕 Bold
        "/System/Library/Fonts/AppleSDGothicNeo.ttc",                     # macOS
        "/usr/share/fonts/truetype/nanum/NanumGothicBold.ttf",            # Linux
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc",
    ],
    "regular": [
        "C:/Windows/Fonts/malgun.ttf",
        "/System/Library/Fonts/AppleSDGothicNeo.ttc",
        "/usr/share/fonts/truetype/nanum/NanumGothic.ttf",
        "/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc",
    ],
}


def font(weight, size):
    for path in FONT_CANDIDATES[weight]:
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    raise SystemExit(f"한글 폰트를 찾지 못했습니다. FONT_CANDIDATES({weight})에 경로를 추가하세요.")


def lerp(a, b, t):
    return tuple(int(x + (y - x) * t) for x, y in zip(a, b))


def main():
    random.seed(42)
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
        c = lerp(VOID, INK, a)
        d.ellipse([x - r, y - r, x + r, y + r], fill=c)

    bold = lambda s: font("bold", s)
    reg = lambda s: font("regular", s)

    def center(text, fnt, y, fill):
        w = d.textlength(text, font=fnt)
        d.text(((W - w) / 2, y), text, font=fnt, fill=fill)

    center("S A M S A R A   S I M U L A T O R", bold(22), 92, GOLD)
    center("환생 시뮬레이터", bold(96), 140, GOLD)
    center("당신의 다음 생은 어디에서 시작될까요?", bold(40), 285, INK)
    center("실제 지구 인구 분포 확률 그대로, 198개국 환생 뽑기", reg(28), 355, MUTED)

    # 등급 알약 행
    pill_f = bold(26)
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

    center("인도 17.9% · 중국 17.5% · 대한민국 0.64% · 모나코 1/207,000", reg(26), 545, GOLD)

    out = Path(__file__).resolve().parent.parent / "og-image.png"
    img.save(out, "PNG")
    print(f"saved: {out} ({out.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
