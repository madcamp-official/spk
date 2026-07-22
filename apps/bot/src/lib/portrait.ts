/* ── 환생 초상 — camp-4 GPU(SDXL-Lightning)에서 생을 그림으로 ──
 *
 * summary.ts와 같은 규약: 환경변수(IMG_BASE_URL)가 비면 조용히 꺼지고,
 * 타임아웃·실패 시 null을 돌려줘 이미지 없는 임베드로 폴백한다. 유저를 기다리게 하지 않는다.
 *
 * ── 프롬프트 설계 원칙 (근거는 research: Rest of World 3,000장 분석, Bianchi et al. 2023) ──
 * 사진풍 + 국가명 인물 프롬프트는 고정관념을 사실상 100% 재생산한다("인도인"=노인+터번 99/100).
 * 그래서:
 *   1) 스타일을 수채화 동화 일러스트로 고정 — 사실성 자체를 낮춘다 (프롬프트 수정만으론 부족하다는 게 연구 결론)
 *   2) 민족(eth)·종교(rel)는 프롬프트에 넣지 않는다 — 나라·도시/농촌·풍경 등 환경만 쓴다
 *   3) 인물은 뒷모습·원경으로만 — 얼굴 캐리커처화를 구조적으로 회피
 *   4) 기대수명 18세 미만은 인물 자체를 그리지 않는다(풍경 컷) — 미성년 생성 필터 리스크와
 *      정서적 부담(§F: 죽음을 조롱하지 않는다)을 동시에 피한다
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

const STYLE =
  "soft watercolor storybook illustration, muted warm palette, gentle brush strokes, " +
  "children's book art style, serene, dignified";

export function portraitPrompt(life: Life, countryCode: string): string {
  const country = countryEn(countryCode);
  const place = life.urban
    ? `a lively everyday street scene in ${country}, local architecture, market stalls, morning light`
    : `a quiet countryside village in ${country}, fields and traditional houses, morning mist`;
  /* 유아·아동기 사망 생: 인물 없는 풍경으로. 새 떼는 떠남의 은유다 — 빈 요람 같은
     직설적 상징은 §F 톤(존엄)을 해친다. */
  if (life.lifeExp < 18) {
    return `${STYLE}, ${place}, an empty winding path, birds flying into a wide open sky, no people`;
  }
  const figure = life.male ? "an adult man" : "an adult woman";
  return `${STYLE}, ${place}, ${figure} seen from behind at a distance, walking along the street, small in frame`;
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
      body: JSON.stringify({ prompt: portraitPrompt(life, countryCode), seed: birthNo }),
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
