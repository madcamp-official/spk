"""환생 초상 생성 서버 — SDXL-Lightning 4-step, RTX 3090 전용.

봇(camp-15)이 POST /generate 로 부른다. 의도적으로 단순하게:
  - 모델은 기동 시 한 번 로드해 상주 (fp16 ≈ 10GB, 24GB 카드에 여유)
  - 요청은 asyncio 락으로 직렬화 — 캠프 트래픽(하루 수십 건)에 큐잉이 더 필요 없다
  - seed는 CPU Generator(diffusers 공식 권장; GPU 생성기보다 재현성이 안정적)
  - 반환은 PNG 바이트 그대로 — 저장·캐시는 부르는 쪽(봇) 책임
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

app = FastAPI()
pipe = None
lock = asyncio.Lock()


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
    negative: str = "photo, photorealistic, text, watermark, signature, deformed, lowres"
    seed: int = 0
    # SDXL 표준 버킷 중 16:9에 가장 가까운 1344x768 — 디스코드 임베드(~400px 폭)에 알맞다
    width: int = 1344
    height: int = 768
    steps: int = 4
    # ISO 3166-1 alpha-2 소문자(예: "kr"). 주면 실제 국기를 우하단에 합성한다.
    # SDXL이 그리는 국기는 복불복이라(태극기는 사실상 창작함) 정체성 표식은 합성으로 보장한다.
    flag: str = ""


FLAG_DIR = "/opt/imggen/flags"


def flag_png(code: str) -> Image.Image | None:
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
    """우하단에 흰 테두리를 두른 실제 국기 배지를 붙인다 — 여권 도장 같은 정체성 앵커."""
    flag = flag_png(code)
    if flag is None:
        return img
    w = 170
    h = round(flag.height * w / flag.width)
    flag = flag.resize((w, h), Image.LANCZOS)
    b, m = 5, 22                                   # 테두리 두께, 가장자리 여백
    badge = Image.new("RGBA", (w + b * 2, h + b * 2), (255, 255, 255, 255))
    badge.paste(flag, (b, b), flag)
    d = ImageDraw.Draw(badge)
    d.rectangle([0, 0, badge.width - 1, badge.height - 1], outline=(60, 60, 60, 255), width=2)
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
    async with lock:                       # 3090 한 장 — 동시 생성은 서로만 느리게 한다
        t0 = time.time()
        gen = torch.Generator("cpu").manual_seed(r.seed)
        img = await asyncio.to_thread(
            lambda: pipe(
                prompt=r.prompt, negative_prompt=r.negative,
                num_inference_steps=r.steps, guidance_scale=0,   # Lightning 공식: CFG 끔
                width=r.width, height=r.height, generator=gen,
            ).images[0]
        )
        if r.flag:
            img = paste_flag(img, r.flag.lower())
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        print(f"[imggen] {r.width}x{r.height} seed={r.seed} flag={r.flag or '-'} {time.time()-t0:.2f}s {len(buf.getvalue())//1024}KB")
        return Response(buf.getvalue(), media_type="image/png")
