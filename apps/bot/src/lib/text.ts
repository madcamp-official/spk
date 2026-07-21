/* 봇이 쓰는 표시 문구. core는 i18n을 모르므로(플랫폼 무관) 표시 계층은 여기 둔다.
 *
 * 지금은 한국어만이다. 다국어는 웹처럼 사전을 두면 되지만, 봇의 언어는 서버 설정
 * (§G guilds.settings)에 묶여야 해서 그 커맨드가 생기는 단계에서 함께 만든다. */
import type { ContinentCode, Life } from "@life-reroll/core";
import { TRAITS } from "@life-reroll/core";

const CONT: Record<ContinentCode, string> = {
  AS: "아시아", EU: "유럽", AF: "아프리카", NA: "북아메리카", SA: "남아메리카", OC: "오세아니아",
};
export function contKo(c: ContinentCode): string { return CONT[c] ?? String(c); }

/** 특성 태그의 표시 이름. key는 DB·custom_id에 들어가는 안정적 식별자다. */
export const TRAIT_LABEL: Record<string, string> = {
  longevity: "장수",
  wealth: "부",
  rare_land: "희귀한 고향",
  genius: "명석",
};
/** 버튼·임베드에 쓰는 이모지 */
export const TRAIT_EMOJI: Record<string, string> = {
  longevity: "⏳", wealth: "💰", rare_land: "🗺️", genius: "🧠",
};
export function traitText(key: string): string {
  return `${TRAIT_EMOJI[key] ?? "✨"} ${TRAIT_LABEL[key] ?? key}`;
}
/** 특성이 붙은 조건을 사람 말로. 임계값은 config가 정본이라 여기서 읽어 쓴다. */
export function traitCondition(key: string): string {
  switch (key) {
    case "longevity": return `기대수명 ${TRAITS.longevityMinYears}세 이상`;
    case "wealth": return `세계 소득 상위 ${TRAITS.wealthTopPct}% 이내`;
    case "rare_land": return `모국 인구 ${TRAITS.rareLandMaxPopM}백만 미만`;
    case "genius": return `IQ ${TRAITS.geniusMinIq} 이상`;
    default: return "";
  }
}

export function fmtUSD(v: number): string {
  const mag = Math.pow(10, Math.max(0, Math.floor(Math.log10(Math.max(v, 1))) - 2));
  return "$" + (Math.round(v / mag) * mag).toLocaleString("en-US");
}

/** 희귀도 점수(0~1) → "상위 n%" 표기. §D */
export function fmtTopPct(score: number): string {
  const pct = score * 100;
  if (pct < 0.0001) return "상위 0.0001% 미만";
  if (pct < 0.01) return `상위 ${pct.toFixed(4)}%`;
  if (pct < 1) return `상위 ${pct.toFixed(2)}%`;
  return `상위 ${pct.toFixed(1)}%`;
}

/** 국가 인구를 한국어 단위로 (Country.pop은 백만 단위) */
export function fmtPop(popM: number): string {
  const n = popM * 1e6;
  if (n >= 1e8) return `${(n / 1e8).toFixed(n >= 3e8 ? 0 : 1).replace(/\.0$/, "")}억 명`;
  if (n >= 1e4) return `${Math.round(n / 1e4).toLocaleString()}만 명`;
  return `${Math.round(n).toLocaleString()}명`;
}

/** 국가 중위 소득 대비 배수 — §D "국가 중위의 n배" 표기 */
export function fmtIncomeMult(life: Life): string {
  const m = life.income / life.c.gdp;
  if (m >= 10) return `국가 중위의 ${Math.round(m)}배`;
  if (m >= 1) return `국가 중위의 ${m.toFixed(1)}배`;
  return `국가 중위의 ${(m * 100).toFixed(0)}%`;
}

/** §E 배틀 축 이름 */
export const AXIS_LABEL: Record<string, string> = {
  lifeExp: "수명", income: "소득", pop: "모국 인구", rarity: "희귀도",
};
export const AXIS_EMOJI: Record<string, string> = {
  lifeExp: "⏳", income: "💰", pop: "🌏", rarity: "💎",
};
export function axisText(axis: string): string {
  return `${AXIS_EMOJI[axis] ?? "•"} ${AXIS_LABEL[axis] ?? axis}`;
}
/** 축의 원값을 사람이 읽는 형태로 (희귀도는 역수를 되돌린다) */
export function axisDisplay(axis: string, raw: number): string {
  switch (axis) {
    case "lifeExp": return `${Math.round(raw)}세`;
    case "income": return `${fmtUSD(raw)}/년`;
    case "pop": return fmtPop(raw);
    case "rarity": return fmtTopPct(1 / raw);
    default: return String(Math.round(raw));
  }
}
