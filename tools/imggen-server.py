"""환생 초상 생성 서버 — SDXL-Lightning 4-step, RTX 3090 전용.

봇(camp-15)이 POST /generate 로 부른다. 의도적으로 단순하게:
  - 모델은 기동 시 한 번 로드해 상주 (fp16 ≈ 10GB, 24GB 카드에 여유)
  - 요청은 asyncio 락으로 직렬화 — 캠프 트래픽(하루 수십 건)에 큐잉이 더 필요 없다
  - seed는 CPU Generator(diffusers 공식 권장; GPU 생성기보다 재현성이 안정적)
  - 반환은 PNG 바이트 그대로 — 저장·캐시는 부르는 쪽(봇) 책임

isolate 파이프라인(봇 기본값): 프롬프트("solo", "white background")는 CFG=0이라 자주
무시되므로, 단독 인물·순백 배경을 **구조적으로** 보장한다:
  ① 정사각 1024²로 생성 — SDXL 인물 복제는 세로로 긴 캔버스의 고질병이라(실측 seed 33
     클론 벽) 네이티브 정사각에서 확률 자체를 줄인다. 최종 비율은 ③에서 만들므로 무관.
  ② rembg로 배경 제거 → 가장 큰 연결 성분(주인공)만 유지 — 떨어져 있는 클론·소품 소멸.
     덩어리가 3개 이상이면 클론 시드로 보고 시드+100만으로 재생성(최대 3회, 결정론적).
  ③ 주인공 bbox를 잘라 요청 캔버스(예: 832x1216) 순백 바탕에 크기 정규화해 합성 —
     시드마다 들쭉날쭉하던 캐릭터 크기가 일정해진다.
  ④ 체형 워프(키→세로, BMI→가로) — 형용사와 달리 반드시 반영된다.
  ⑤ 실제 국기 배지(flagcdn) 합성 — SDXL이 그리는 국기는 창작물이라 신뢰하지 않는다.
"""
import asyncio
import io
import os
import time
import urllib.request

import torch
from PIL import Image, ImageDraw
from diffusers import EulerDiscreteScheduler, StableDiffusionXLPipeline, UNet2DConditionModel
from fastapi import FastAPI
from fastapi.responses import JSONResponse, Response
from huggingface_hub import hf_hub_download
from pydantic import BaseModel
from safetensors.torch import load_file

BASE = "stabilityai/stable-diffusion-xl-base-1.0"
LIGHTNING_REPO = "ByteDance/SDXL-Lightning"
LIGHTNING_CKPT = "sdxl_lightning_4step_unet.safetensors"   # 4-step full UNet (공식 권장)
FLAG_DIR = "/opt/imggen/flags"

app = FastAPI()
pipe = None
lock = asyncio.Lock()

os.environ.setdefault("U2NET_HOME", "/opt/imggen/u2net")
try:
    from rembg import new_session, remove as rembg_remove
    REMBG = new_session("u2net")                      # 기동 때 로드 — 첫 요청서 다운로드 방지
except Exception as e:
    print(f"[imggen] rembg 없음 — isolate 무시: {e}")
    REMBG = None


@app.on_event("startup")
def load_model():
    global pipe
    t0 = time.time()
    unet = UNet2DConditionModel.from_config(BASE, subfolder="unet").to("cuda", torch.float16)
    unet.load_state_dict(load_file(hf_hub_download(LIGHTNING_REPO, LIGHTNING_CKPT), device="cuda"))
    pipe = StableDiffusionXLPipeline.from_pretrained(
        BASE, unet=unet, torch_dtype=torch.float16, variant="fp16"
    ).to("cuda")
    # Lightning은 trailing 스케줄러가 필수 — 기본 스케줄러로는 4스텝 품질이 무너진다
    pipe.scheduler = EulerDiscreteScheduler.from_config(
        pipe.scheduler.config, timestep_spacing="trailing"
    )
    print(f"[imggen] 모델 로드 {time.time()-t0:.1f}s, VRAM {torch.cuda.memory_allocated()/2**30:.1f}GB")


class Req(BaseModel):
    prompt: str
    negative: str = "photo, photorealistic, text, watermark, signature, lowres"
    seed: int = 0
    width: int = 832                                  # 최종 캔버스 (isolate면 생성은 1024²)
    height: int = 1216
    steps: int = 4
    flag: str = ""                                    # ISO alpha-2 소문자 — 실제 국기 배지
    xscale: float = 1.0                               # 체형 워프 (BMI)
    yscale: float = 1.0                               # 체형 워프 (키)
    isolate: bool = False                             # 단독 인물 + 순백 배경 보장 파이프라인


def cut_main_subject(img: Image.Image):
    """rembg → 가장 큰 연결 성분만 남긴 RGBA와 유의미 덩어리 수를 돌려준다."""
    if REMBG is None:
        return None, 1
    import numpy as np
    from scipy import ndimage

    cut = rembg_remove(img, session=REMBG)            # RGBA, 배경 alpha=0
    a = np.array(cut.getchannel("A"))
    mask = a > 96
    labels, n = ndimage.label(mask)
    if n == 0:
        return None, 1                                # 분리 실패
    sizes = ndimage.sum(mask, labels, range(1, n + 1))
    big = int((sizes > sizes.max() * 0.05).sum())     # 최대의 5% 넘는 덩어리만 셈
    a[labels != (int(sizes.argmax()) + 1)] = 0        # 주인공 밖 전부 제거
    cut.putalpha(Image.fromarray(a))
    return cut, big


def compose_on_white(cut: Image.Image, w: int, h: int) -> Image.Image:
    """주인공 bbox를 잘라 순백 캔버스에 크기 정규화해 앉힌다(바닥 여백 3%)."""
    bbox = cut.getbbox()
    if bbox is None:
        return Image.new("RGB", (w, h), (255, 255, 255))
    c = cut.crop(bbox)
    s = min(w * 0.86 / c.width, h * 0.90 / c.height)
    c = c.resize((max(1, round(c.width * s)), max(1, round(c.height * s))), Image.LANCZOS)
    canvas = Image.new("RGB", (w, h), (255, 255, 255))
    canvas.paste(c, ((w - c.width) // 2, h - c.height - round(h * 0.03)), c)
    return canvas


def body_warp(img: Image.Image, xscale: float, yscale: float) -> Image.Image:
    """캐릭터를 키·체중 비율로 눌러/늘려 같은 캔버스에 다시 앉힌다. 바닥 정렬, 여백은 모서리 색."""
    xs = max(0.5, min(1.6, xscale))
    ys = max(0.5, min(1.2, yscale))
    if abs(xs - 1) < 0.01 and abs(ys - 1) < 0.01:
        return img
    w, h = img.size
    nw, nh = round(w * xs), round(h * ys)
    warped = img.resize((nw, nh), Image.LANCZOS)
    canvas = Image.new("RGB", (w, h), img.getpixel((4, 4)))
    canvas.paste(warped, ((w - nw) // 2, h - nh))
    return canvas


def flag_png(code: str):
    """flagcdn의 실제 국기(w160)를 받아 디스크에 캐시하고 PIL 이미지로 돌려준다."""
    if not code.isalpha() or len(code) != 2:
        return None
    os.makedirs(FLAG_DIR, exist_ok=True)
    path = os.path.join(FLAG_DIR, f"{code}.png")
    if not os.path.exists(path):
        try:
            urllib.request.urlretrieve(f"https://flagcdn.com/w160/{code}.png", path)
        except Exception:
            return None
    try:
        return Image.open(path).convert("RGBA")
    except Exception:
        return None


def paste_flag(img: Image.Image, code: str) -> Image.Image:
    """우하단에 흰 테두리를 두른 실제 국기 배지 — 여권 도장 같은 정체성 앵커."""
    flag = flag_png(code)
    if flag is None:
        return img
    w = 170
    h = round(flag.height * w / flag.width)
    flag = flag.resize((w, h), Image.LANCZOS)
    b, m = 5, 22
    badge = Image.new("RGBA", (w + b * 2, h + b * 2), (255, 255, 255, 255))
    badge.paste(flag, (b, b), flag)
    ImageDraw.Draw(badge).rectangle(
        [0, 0, badge.width - 1, badge.height - 1], outline=(60, 60, 60, 255), width=2)
    img = img.convert("RGBA")
    img.alpha_composite(badge, (img.width - badge.width - m, img.height - badge.height - m))
    return img.convert("RGB")


@app.get("/health")
def health():
    ok = pipe is not None
    return {"ok": ok, "vram_gb": round(torch.cuda.memory_allocated() / 2**30, 1) if ok else 0}


@app.post("/generate")
async def generate(r: Req):
    if pipe is None:
        return JSONResponse({"error": "model not loaded"}, status_code=503)
    async with lock:                                  # 3090 한 장 — 직렬화
        t0 = time.time()

        def draw(seed: int, w: int, h: int) -> Image.Image:
            gen = torch.Generator("cpu").manual_seed(seed)
            return pipe(
                prompt=r.prompt, negative_prompt=r.negative,
                num_inference_steps=r.steps, guidance_scale=0,   # Lightning 공식: CFG 끔
                width=w, height=h, generator=gen,
            ).images[0]

        tries = 1
        if r.isolate and REMBG is not None:
            # 정사각 생성(복제 억제) + 덩어리 수로 클론 시드 우회(결정론적 재시도)
            best_cut, best_blobs = None, 10 ** 9
            for attempt in range(3):
                tries = attempt + 1
                raw = await asyncio.to_thread(draw, r.seed + attempt * 1_000_000, 1024, 1024)
                cut, blobs = await asyncio.to_thread(cut_main_subject, raw)
                if cut is not None and blobs < best_blobs:
                    best_cut, best_blobs = cut, blobs
                if blobs <= 2:
                    break
            if tries > 1:
                print(f"[imggen] 클론 시드 우회: {tries}회, 최종 덩어리 {best_blobs}")
            img = compose_on_white(best_cut, r.width, r.height) if best_cut is not None \
                else await asyncio.to_thread(draw, r.seed, r.width, r.height)
        else:
            img = await asyncio.to_thread(draw, r.seed, r.width, r.height)

        img = body_warp(img, r.xscale, r.yscale)
        if r.flag:                                    # 배지는 워프 뒤 — 국기는 안 찌그러진다
            img = paste_flag(img, r.flag.lower())
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        print(f"[imggen] {r.width}x{r.height} seed={r.seed} flag={r.flag or '-'} "
              f"tries={tries} {time.time()-t0:.2f}s {len(buf.getvalue())//1024}KB")
        return Response(buf.getvalue(), media_type="image/png")
