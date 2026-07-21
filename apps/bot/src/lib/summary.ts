/* §F 인생 요약 — 3문장 서사
 *
 * 1차 구현은 **사전 생성 템플릿**이다. 조합 키로 골라 수치를 슬롯 치환한다.
 * LLM은 인터페이스만 두고 환경변수로 주입하며, 미설정이면 조용히 템플릿으로 간다.
 * 실시간 호출은 레어 생에만, 타임아웃이면 템플릿으로 되돌아온다(§F).
 *
 * ⚠ 톤 가이드(§F) — 이 파일이 유저에게 보이는 문장을 전부 만든다:
 *   · 죽음·빈곤을 조롱하거나 희화화하지 않는다.
 *   · 저소득 국가의 생을 "꽝"으로 쓰지 않는다. 모든 생은 완결된 삶이고 덱의 자산이다.
 *   · 국가를 비하하지 않는다.
 * 그래서 템플릿은 소득 구간에 따라 어휘를 바꾸되, 어느 구간에도 우열을 넣지 않았다.
 * "가난"을 결핍이 아니라 삶의 조건으로 서술한다.
 */
import type { Life } from "@life-reroll/core";
import { contKo } from "./text.js";
import { env, llmEnabled } from "../env.js";

/** 소득 구간 — 템플릿 선택용. 이름 자체가 유저에게 노출되지는 않는다. */
type IncomeBand = "modest" | "middle" | "comfortable";
function band(life: Life): IncomeBand {
  if (life.top <= 20) return "comfortable";
  if (life.top <= 60) return "middle";
  return "modest";
}

/* 조합 키: 대륙 × 도시/농촌 × 소득 구간. 성별은 문장에서 대명사로 쓰지 않아 키에서 뺐다
   (한국어 3인칭은 성별을 강제하지 않아도 자연스럽고, 조합 수가 절반이 된다). */
const OPENING: Record<string, string[]> = {
  urban: [
    "{country}의 도시에서 태어났다.",
    "{country}, 도시의 소음 속에서 첫 숨을 쉬었다.",
  ],
  rural: [
    "{country}의 시골 마을에서 태어났다.",
    "{country}, 도시에서 먼 곳에서 첫 숨을 쉬었다.",
  ],
};
const MIDDLE: Record<IncomeBand, string[]> = {
  comfortable: [
    "{lang}를 모국어로 배웠고, 손에 쥔 것이 적지 않은 채로 자랐다.",
    "{lang}로 처음 말을 배웠다. 가진 것이 부족하지 않은 시절이었다.",
  ],
  middle: [
    "{lang}를 모국어로 배웠고, 있을 것은 있고 없는 것은 없는 채로 자랐다.",
    "{lang}로 처음 말을 배웠다. 대개는 넉넉하지도 모자라지도 않았다.",
  ],
  modest: [
    "{lang}를 모국어로 배웠고, 많지 않은 것을 오래 아껴 쓰며 자랐다.",
    "{lang}로 처음 말을 배웠다. 가진 것은 적었지만 하루하루는 분명했다.",
  ],
};
const CLOSING: string[] = [
  "{lifeExp}년을 살았다.",
  "{lifeExp}년의 생이었다.",
  "{lifeExp}년을 지나 이 생을 마쳤다.",
];
/* 특성이 있으면 닫는 문장에 한 조각 덧붙인다 — 서사에 개성이 생긴다. */
const TRAIT_CLAUSE: Record<string, string> = {
  longevity: "또래보다 오래 남아 많은 것을 배웅했다.",
  wealth: "쥔 것이 많아 나눌 일도 많았다.",
  rare_land: "같은 곳에서 시작한 사람이 세상에 그리 많지 않았다.",
  genius: "남들이 오래 붙잡는 문제를 빨리 놓아 주었다.",
};

/** 결정적 선택 — 같은 생은 늘 같은 문장을 받는다(출생 번호를 시드로).
 *  랜덤이면 같은 생을 /여권으로 다시 볼 때 서사가 바뀌어 기록처럼 느껴지지 않는다. */
function pick<T>(arr: T[], seed: number): T {
  return arr[Math.abs(seed) % arr.length] as T;
}

export function templateSummary(life: Life, birthNo: number, traits: string[]): string {
  const slots = {
    country: life.c.name,
    lang: life.c.lang,
    lifeExp: String(life.lifeExp),
    cont: contKo(life.c.cont),
  };
  const fill = (s: string) =>
    s.replace(/\{(\w+)\}/g, (_, k: string) => (slots as Record<string, string>)[k] ?? `{${k}}`);

  const a = fill(pick(OPENING[life.urban ? "urban" : "rural"]!, birthNo));
  const b = fill(pick(MIDDLE[band(life)]!, birthNo + 1));
  let c = fill(pick(CLOSING, birthNo + 2));
  const t = traits.find(k => TRAIT_CLAUSE[k]);
  if (t) c += " " + TRAIT_CLAUSE[t];
  return `${a} ${b} ${c}`;
}

/* ── LLM (선택) ───────────────────────────────────────────────
   OpenAI 호환 /chat/completions 하나만 쓴다 — vLLM·OpenAI·그 밖 무엇이든 붙는다.
   SDK를 넣지 않는 이유: 의존성 하나를 아끼고, 교체 가능성을 열어 두기 위해서다. */
async function llmSummary(life: Life, traits: string[], signal: AbortSignal): Promise<string | null> {
  const prompt = [
    "다음 사람의 생을 한국어 3문장으로 담담하게 서술해 줘.",
    "규칙: 죽음이나 가난을 조롱하지 말 것. 어느 나라도 비하하지 말 것.",
    "불행을 극적으로 과장하지 말고, 완결된 하나의 삶으로 존엄하게 쓸 것.",
    "",
    `나라: ${life.c.name} (${contKo(life.c.cont)})`,
    `성별: ${life.male ? "남성" : "여성"}`,
    `도시/농촌: ${life.urban ? "도시" : "농촌"}`,
    `모국어: ${life.c.lang}`,
    `기대수명: ${life.lifeExp}세`,
    `연 소득: 약 $${Math.round(life.income).toLocaleString()} (세계 상위 ${life.top.toFixed(1)}%)`,
    traits.length ? `특성: ${traits.join(", ")}` : "",
  ].filter(Boolean).join("\n");

  const r = await fetch(`${env.llm.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    signal,
    headers: {
      "content-type": "application/json",
      ...(env.llm.apiKey ? { authorization: `Bearer ${env.llm.apiKey}` } : {}),
    },
    body: JSON.stringify({
      model: env.llm.model,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 300,
      temperature: 0.8,
    }),
  });
  if (!r.ok) return null;
  const j = await r.json() as { choices?: { message?: { content?: string } }[] };
  const text = j.choices?.[0]?.message?.content?.trim();
  return text || null;
}

/** 인생 요약을 만든다. 어떤 경우에도 문자열을 돌려준다 — 실패하면 템플릿이다. */
export async function buildSummary(
  life: Life, birthNo: number, traits: string[], rarityTopPct: number,
): Promise<{ text: string; source: "llm" | "template" }> {
  const fallback = templateSummary(life, birthNo, traits);
  /* §F: 실시간 LLM은 레어 생에만. 흔한 생까지 부르면 비용도 지연도 감당이 안 된다. */
  if (!llmEnabled || rarityTopPct > env.llm.rarityTopPct) return { text: fallback, source: "template" };

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), env.llm.timeoutMs);
  try {
    const text = await llmSummary(life, traits, ctl.signal);
    return text ? { text, source: "llm" } : { text: fallback, source: "template" };
  } catch {
    /* 타임아웃·네트워크 실패 — 조용히 템플릿으로. 유저는 기다리다 빈 화면을 보면 안 된다. */
    return { text: fallback, source: "template" };
  } finally {
    clearTimeout(timer);
  }
}
