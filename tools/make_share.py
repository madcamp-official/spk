# -*- coding: utf-8 -*-
"""언어별 공유 랜딩 페이지 생성 — Reddit·해외 커뮤니티에 링크를 뿌릴 때 쓴다.

문제: 크롤러(Reddit/트위터/페북/디스코드)는 정적 HTML의 <meta og:*> 만 읽는다.
      index.html의 og는 한국어라, 그대로 뿌리면 미리보기가 한국어로 뜬다.
해결: 언어별 미니 페이지(en.html … pt.html)를 만든다.
      - 크롤러: 이 페이지의 og(언어별 배너·제목·설명)를 읽고 멈춘다(JS 실행 안 함).
      - 사람: JS가 localStorage에 언어를 심고 곧바로 앱('/')으로 replace 한다.
        → i18n의 pickLang()이 '저장값 최우선'이라 앱이 그 언어로 뜬다(앱 코드 수정 불필요).

  Reddit엔:  https://life-reroll.com/en   (nginx try_files 가 en.html 로 잇는다)

실행:  python3 tools/make_share.py
"""
from pathlib import Path

CANON = "https://life-reroll.com"

# 언어별 og 메타. 배너(og:image)는 make_og.py 가 만든 og-image-<lang>.png 와 짝을 이룬다.
PAGES = {
    "en": dict(
        htmllang="en",
        locale="en_US",
        title="Rebirth Simulator · Where will your next life begin?",
        desc="Reroll your next life weighted by the real population of Earth. "
             "India + China ≈ 35%, Monaco 1 in 207,000. Draw across 198 countries.",
        enter="Enter",
    ),
    "ja": dict(
        htmllang="ja",
        locale="ja_JP",
        title="輪廻転生シミュレーター · あなたの来世はどこから始まる?",
        desc="実際の地球の人口分布そのままに来世を抽選。インドと中国で約35%、"
             "モナコは20万分の1。198か国からあなたの次の人生を引こう。",
        enter="はじめる",
    ),
    "zh": dict(
        htmllang="zh",
        locale="zh_CN",
        title="转世模拟器 · 你的下一世会从哪里开始?",
        desc="按真实地球人口分布抽取你的下一世。印度和中国合计约35%,"
             "摩纳哥仅二十万分之一。在198个国家中抽出你的下一世。",
        enter="进入",
    ),
    "es": dict(
        htmllang="es",
        locale="es_ES",
        title="Simulador de Reencarnación · ¿Dónde empezará tu próxima vida?",
        desc="Reencarna según la distribución real de la población de la Tierra. "
             "India y China ≈ 35 %, Mónaco 1 entre 207 000. Saca tu vida entre 198 países.",
        enter="Entrar",
    ),
    "pt": dict(
        htmllang="pt",
        locale="pt_BR",
        title="Simulador de Reencarnação · Onde vai começar sua próxima vida?",
        desc="Renasça pela distribuição real da população da Terra. "
             "Índia e China ≈ 35%, Mônaco 1 em 207.000. Sorteie sua vida entre 198 países.",
        enter="Entrar",
    ),
}

TEMPLATE = """<!doctype html>
<html lang="{htmllang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{title}</title>
<meta name="description" content="{desc}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Rebirth Simulator">
<meta property="og:title" content="{title}">
<meta property="og:description" content="{desc}">
<meta property="og:image" content="{canon}/og-image-{lang}.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<!-- og:url 은 이 랜딩 자신을 가리킨다. FB/디스코드 등은 og:url을 정본으로 보고 그 페이지를
     다시 긁는데, 여기를 '/'(한국어)로 두면 미리보기가 한국어로 덮인다. 검색엔진용 정본은
     아래 <link rel=canonical>('/')로 따로 알려준다. -->
<meta property="og:url" content="{canon}/{lang}">
<meta property="og:locale" content="{locale}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{title}">
<meta name="twitter:description" content="{desc}">
<meta name="twitter:image" content="{canon}/og-image-{lang}.png">
<link rel="canonical" href="{canon}/">
<!-- 사람은 앱으로 보낸다. 언어를 저장하고 가면 pickLang()이 그 언어로 띄운다.
     크롤러는 JS를 실행하지 않으므로 위 og만 읽고 멈춘다(미리보기가 이 언어로 뜬다). -->
<script>try{{localStorage.setItem("rebirth_lang","{lang}")}}catch(e){{}}location.replace("/");</script>
<style>
 html,body{{margin:0;height:100%;background:#0a0d1c;color:#ece9f5;
  font-family:system-ui,-apple-system,"Segoe UI",Roboto,"Noto Sans",sans-serif}}
 .wrap{{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:18px;text-align:center;padding:24px}}
 .brand{{letter-spacing:.35em;font-size:13px;color:#f3c95c;text-transform:uppercase}}
 a.enter{{color:#0a0d1c;background:#f3c95c;text-decoration:none;font-weight:700;
  padding:12px 26px;border-radius:999px;font-size:16px}}
 p{{color:#9a98b5;margin:0;font-size:14px}}
</style>
</head>
<body>
<div class="wrap">
 <div class="brand">Samsara Simulator</div>
 <p>{title}</p>
 <a class="enter" href="/">{enter} &rarr;</a>
</div>
</body>
</html>
"""


def main():
    root = Path(__file__).resolve().parent.parent
    for lang, spec in PAGES.items():
        html = TEMPLATE.format(canon=CANON, lang=lang, **spec)
        out = root / f"{lang}.html"
        out.write_text(html, encoding="utf-8")
        print(f"saved: {lang}.html  ({len(html)} bytes)")


if __name__ == "__main__":
    main()
