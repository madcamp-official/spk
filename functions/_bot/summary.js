/* §F 인생 요약 — apps/bot/src/lib/summary.ts 이식본.
 * 기본은 사전 생성 템플릿(결정적 — 출생 번호 시드). LLM 은 env 로 주입되며 미설정이면
 * 조용히 템플릿으로 간다(운영 VM 에서도 LLM_BASE_URL 은 비어 있었다).
 * 톤 가이드(§F): 죽음·빈곤 조롱 금지, 저소득 생을 "꽝"으로 쓰지 않는다 — 문구 원본 그대로. */
import { contKo } from "./text.js";

function band(life) {
  if (life.top <= 20) return "comfortable";
  if (life.top <= 60) return "middle";
  return "modest";
}

const OPENING = {
  urban: [
    "{country}의 도시에서 태어났다.",
    "{country}, 도시의 소음 속에서 첫 숨을 쉬었다.",
  ],
  rural: [
    "{country}의 시골 마을에서 태어났다.",
    "{country}, 도시에서 먼 곳에서 첫 숨을 쉬었다.",
  ],
};
const MIDDLE = {
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
const CLOSING = [
  "{lifeExp}년을 살았다.",
  "{lifeExp}년의 생이었다.",
  "{lifeExp}년을 지나 이 생을 마쳤다.",
];
const TRAIT_CLAUSE = {
  longevity: "또래보다 오래 남아 많은 것을 배웅했다.",
  wealth: "쥔 것이 많아 나눌 일도 많았다.",
  rare_land: "같은 곳에서 시작한 사람이 세상에 그리 많지 않았다.",
  genius: "남들이 오래 붙잡는 문제를 빨리 놓아 주었다.",
};

/** 결정적 선택 — 같은 생은 늘 같은 문장을 받는다(출생 번호 시드). */
const pick = (arr, seed) => arr[Math.abs(seed) % arr.length];

export function templateSummary(life, birthNo, traits) {
  const slots = {
    country: life.c.name, lang: life.c.lang,
    lifeExp: String(life.lifeExp), cont: contKo(life.c.cont),
  };
  const fill = s => s.replace(/\{(\w+)\}/g, (_, k) => slots[k] ?? `{${k}}`);

  const a = fill(pick(OPENING[life.urban ? "urban" : "rural"], birthNo));
  const b = fill(pick(MIDDLE[band(life)], birthNo + 1));
  let c = fill(pick(CLOSING, birthNo + 2));
  const t = traits.find(k => TRAIT_CLAUSE[k]);
  if (t) c += " " + TRAIT_CLAUSE[t];
  return `${a} ${b} ${c}`;
}

async function llmSummary(env, life, traits, signal) {
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

  const r = await fetch(`${env.LLM_BASE_URL.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    signal,
    headers: {
      "content-type": "application/json",
      ...(env.LLM_API_KEY ? { authorization: `Bearer ${env.LLM_API_KEY}` } : {}),
    },
    body: JSON.stringify({
      model: env.LLM_MODEL,
      messages: [{ role: "user", content: prompt }],
      max_tokens: 300,
      temperature: 0.8,
    }),
  });
  if (!r.ok) return null;
  const j = await r.json();
  const text = j.choices?.[0]?.message?.content?.trim();
  return text || null;
}

/** 어떤 경우에도 문자열을 돌려준다 — 실패하면 템플릿이다. */
export async function buildSummary(env, life, birthNo, traits, rarityTopPct) {
  const fallback = templateSummary(life, birthNo, traits);
  const enabled = Boolean(env.LLM_BASE_URL && env.LLM_MODEL);
  const topPct = Number(env.LLM_RARITY_TOP_PCT) || 0.1;
  if (!enabled || rarityTopPct > topPct) return { text: fallback, source: "template" };

  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), Number(env.LLM_TIMEOUT_MS) || 8000);
  try {
    const text = await llmSummary(env, life, traits, ctl.signal);
    return text ? { text, source: "llm" } : { text: fallback, source: "template" };
  } catch {
    return { text: fallback, source: "template" };
  } finally {
    clearTimeout(timer);
  }
}
