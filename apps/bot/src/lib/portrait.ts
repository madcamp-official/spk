/* ── 환생 초상 — camp-4 GPU(SDXL-Lightning)에서 생을 그림으로 ──
 *
 * summary.ts와 같은 규약: 환경변수(IMG_BASE_URL)가 비면 조용히 꺼지고,
 * 타임아웃·실패 시 null을 돌려줘 이미지 없는 임베드로 폴백한다. 유저를 기다리게 하지 않는다.
 *
 * ── 프롬프트 설계 원칙 (근거는 research: Rest of World 3,000장 분석, Bianchi et al. 2023) ──
 * 사진풍 + 국가명 인물 프롬프트는 고정관념을 사실상 100% 재생산한다("인도인"=노인+터번 99/100).
 * 그래서 치비(SD) 라인업 컨셉으로 리스크를 구조적으로 줄인다:
 *   1) 사진풍 금지 — 치비 카툰으로 사실성 자체를 낮춘다 (프롬프트 수정만으론 부족하다는 게 연구 결론)
 *   2) 의상은 전원 흰 티셔츠+청바지 통일 — 문화 의상 캐리커처가 나올 자리가 없다
 *   3) 민족(eth)·종교(rel)는 프롬프트에 넣지 않는다 — 외모는 국가로, 국적 표식은 실제 국기 배지로
 *   4) 신체 특성(키·체형·탈모·성별)은 생 데이터에서 그대로 — 이 생의 "그 사람"이 그려진다
 *   5) 항상 성인상으로 그린다 — 미성년 묘사를 만들지 않는 것이 §F 톤과 필터 리스크 양쪽에 안전
 *
 * ── 재현성 ──
 * seed는 출생 번호. 하지만 시드 재현은 "같은 모델 버전" 조건부라(프로바이더/체크포인트 교체 시 깨짐),
 * 진짜 "같은 생 = 같은 그림" 보장은 디스크 캐시가 담당한다: 생당 정확히 1회 생성, 영구 보관.
 * 웹의 OG 이미지 캐시(OG_DIR)와 같은 패턴이다. */
import { mkdirSync } from "node:fs";
import { readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { Life } from "@life-reroll/core";
import { env, imgEnabled } from "../env.js";

/* 나라 이름은 core 데이터가 한국어라 SDXL이 못 알아듣는다 — ISO 코드로 영어명을 얻는다.
   웹(i18n.js countryName)과 같은 접근. 실패하면 코드 그대로(그래도 대개 알아듣는다). */
const EN = new Intl.DisplayNames(["en"], { type: "region" });
function countryEn(code: string): string {
  try { return EN.of(code) ?? code; } catch { return code; }
}

/* SD(치비) 캐릭터 라인업 컨셉: 전원 흰 티셔츠+청바지, 키 측정선 벽 앞. 의상이 통일이라
   문화 의상 캐리커처가 원천 차단되고, 국적은 서버가 합성하는 **실제 국기 배지**가 말한다.
   "국기를 손에 든" 구도는 실험 결과 포기했다 — SDXL이 태극기 등 대부분의 국기를
   창작해 버려서(성조기풍 짝퉁), 틀린 국기를 들려주느니 정확한 배지가 낫다. */
const STYLE = "chibi, super deformed, big head small body, two heads tall, full body";
const TAIL =
  "wearing a simple crew neck white cotton t-shirt and blue denim jeans, bare neck, standing straight facing viewer, cheerful smile, " +
  "one hand raised in a friendly wave, plain light gray wall with horizontal height measurement lines, " +
  "simple cel-shaded illustration, soft colors";
/* ⚠ Lightning은 guidance_scale=0이라 negative prompt가 **무효**다(CFG가 꺼지면 계산 자체가 생략).
   그래서 의상·소품 통제는 전부 positive 서술로 한다. NEGATIVE는 나중에 CFG 있는 모델로
   갈아탈 때를 위해 계속 보낸다 — 지금은 관성 비용 0인 보험이다. */
const NEGATIVE =
  "photorealistic, photo, realistic proportions, text, letters, numbers, watermark, " +
  "extra limbs, multiple people, brick wall, furniture, props, flag, banner, stars and stripes, " +
  "necktie, tie, collared shirt, suit, jacket";

/* 키·체형 말은 프롬프트 **맨 앞**에 둬야 반영된다(SDXL은 앞 토큰에 가중).
   구간은 절대값 기준 — 라인업에서 눈으로 비교되는 건 상대키가 아니라 절대 인상이다. */
function bodyDesc(life: Life): string {
  const bmi = life.weight / (life.height / 100) ** 2;
  const build = bmi < 18.5 ? "skinny" : bmi < 23 ? "slim" : bmi < 27 ? "average build"
    : bmi < 32 ? "chubby" : "very fat round-bellied";
  const h = life.height;
  const height = h < 155 ? "very short" : h < 165 ? "short" : h < 178 ? "average height"
    : h < 190 ? "tall" : "very tall";
  return `${height}, ${build}`;
}

export function portraitPrompt(life: Life, countryCode: string): string {
  /* 항상 "adult" — 치비는 어차피 동안이고, 미성년 묘사 자체를 만들지 않는 게
     §F 톤과 필터 리스크 양쪽에서 안전하다. 수명이 짧은 생도 '그 생의 사람'을 성인상으로 그린다. */
  const figure = `a ${bodyDesc(life)}${life.balding ? ", bald" : ""} adult ` +
    `${life.male ? "man" : "woman"} from ${countryEn(countryCode)}`;
  const baldHint = life.balding ? " shiny bald head, no hair," : "";
  return `${STYLE} — ${figure},${baldHint} ${TAIL}`;
}

/** 초상을 가져온다 — 캐시 우선, 없으면 생성. 어떤 실패에도 null(이미지 없는 임베드로). */
export async function buildPortrait(
  life: Life, birthNo: number, countryCode: string,
): Promise<Buffer | null> {
  if (!imgEnabled) return null;
  const file = path.join(env.img.dir, `${birthNo}.png`);
  try { return await readFile(file); } catch { /* 캐시 미스 — 생성으로 */ }

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), env.img.timeoutMs);
  try {
    const r = await fetch(`${env.img.baseUrl!.replace(/\/$/, "")}/generate`, {
      method: "POST",
      signal: ctl.signal,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        prompt: portraitPrompt(life, countryCode),
        negative: NEGATIVE,
        seed: birthNo,
        width: 832, height: 1216,                    /* 전신 세로 컷 (SDXL 표준 버킷) */
        flag: countryCode.toLowerCase(),             /* 서버가 실제 국기 배지를 합성 */
      }),
    });
    if (!r.ok) return null;
    const buf = Buffer.from(await r.arrayBuffer());
    if (!buf.length) return null;
    /* 캐시에 원자적으로 남긴다 — 실패해도 이번 응답에는 지장 없다 */
    try {
      mkdirSync(env.img.dir, { recursive: true });
      const tmp = `${file}.tmp-${process.pid}`;
      await writeFile(tmp, buf);
      await rename(tmp, file);
    } catch { /* 캐시 실패는 치명적이지 않다 — 다음에 다시 생성될 뿐 */ }
    return buf;
  } catch {
    return null;   /* 타임아웃·GPU 서버 다운 — 조용히 이미지 없이 */
  } finally {
    clearTimeout(timer);
  }
}
