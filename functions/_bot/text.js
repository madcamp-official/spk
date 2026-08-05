/* 봇 표시 문구 — apps/bot/src/lib/text.ts 이식본 (한국어 전용, 로직 동일).
 * ⚠ core 는 반드시 apps/web/core/ 쪽을 import 한다 — functions/api/roll.js 주석 참조
 *   (packages/core/dist 를 물면 한 번들에 core 가 두 벌 들어간다). */
import { TRAITS } from "../../apps/web/core/index.js";

const CONT = {
  AS: "아시아", EU: "유럽", AF: "아프리카", NA: "북아메리카", SA: "남아메리카", OC: "오세아니아",
};
export function contKo(c) { return CONT[c] ?? String(c); }

/** 특성 태그의 표시 이름. key 는 DB·custom_id 에 들어가는 안정적 식별자다. */
export const TRAIT_LABEL = {
  longevity: "장수", wealth: "부", rare_land: "희귀한 고향", genius: "명석",
};
export const TRAIT_EMOJI = {
  longevity: "⏳", wealth: "💰", rare_land: "🗺️", genius: "🧠",
};
export function traitText(key) {
  return `${TRAIT_EMOJI[key] ?? "✨"} ${TRAIT_LABEL[key] ?? key}`;
}
export function traitCondition(key) {
  switch (key) {
    case "longevity": return `기대수명 ${TRAITS.longevityMinYears}세 이상`;
    case "wealth": return `세계 소득 상위 ${TRAITS.wealthTopPct}% 이내`;
    case "rare_land": return `모국 인구 ${TRAITS.rareLandMaxPopM}백만 미만`;
    case "genius": return `IQ ${TRAITS.geniusMinIq} 이상`;
    default: return "";
  }
}

export function fmtUSD(v) {
  const mag = Math.pow(10, Math.max(0, Math.floor(Math.log10(Math.max(v, 1))) - 2));
  return "$" + (Math.round(v / mag) * mag).toLocaleString("en-US");
}

/** 희귀도 점수(0~1) → "상위 n%" 표기. §D */
export function fmtTopPct(score) {
  const pct = score * 100;
  if (pct < 0.0001) return "상위 0.0001% 미만";
  if (pct < 0.01) return `상위 ${pct.toFixed(4)}%`;
  if (pct < 1) return `상위 ${pct.toFixed(2)}%`;
  return `상위 ${pct.toFixed(1)}%`;
}

/** 국가 인구를 한국어 단위로 (Country.pop 은 백만 단위) */
export function fmtPop(popM) {
  const n = popM * 1e6;
  if (n >= 1e8) return `${(n / 1e8).toFixed(n >= 3e8 ? 0 : 1).replace(/\.0$/, "")}억 명`;
  if (n >= 1e4) return `${Math.round(n / 1e4).toLocaleString()}만 명`;
  return `${Math.round(n).toLocaleString()}명`;
}

/** §E 배틀 축 이름 */
export const AXIS_LABEL = { lifeExp: "수명", income: "소득", pop: "모국 인구", rarity: "희귀도" };
export const AXIS_EMOJI = { lifeExp: "⏳", income: "💰", pop: "🌏", rarity: "💎" };
export function axisText(axis) {
  return `${AXIS_EMOJI[axis] ?? "•"} ${AXIS_LABEL[axis] ?? axis}`;
}
/** 축의 원값을 사람이 읽는 형태로 (희귀도는 역수를 되돌린다) */
export function axisDisplay(axis, raw) {
  switch (axis) {
    case "lifeExp": return `${Math.round(raw)}세`;
    case "income": return `${fmtUSD(raw)}/년`;
    case "pop": return fmtPop(raw);
    case "rarity": return fmtTopPct(1 / raw);
    default: return String(Math.round(raw));
  }
}
