/* 임베드·버튼 — apps/bot/src/lib/render.ts + rows.ts 이식본.
 * discord.js 빌더 대신 Discord API raw JSON 을 만든다. §C·§A.6 규약은 그대로다:
 * 결과는 공개, 초대 링크 없음, 버튼 custom_id 에 상태 인코딩(stateless). */
import { countryByCode, rarityColor } from "../../apps/web/core/index.js";
import { fmtTopPct, traitText } from "./text.js";
import { statFields, viewFromLife, viewFromRow } from "./view.js";

export const BOT_FOOTER = "환생 시뮬레이터";
/** 스탯 출처 명시는 톤 가이드(§F) 요구사항이다 — 빼지 말 것. */
const SOURCE_NOTE = "UN WPP 2024 · World Bank 기반 추정";

export const colorOf = (pop) => Number.parseInt(rarityColor(pop).slice(1), 16);

/* ── custom_id (§A.6 stateless) ── */
export const KARMA_PREFIX = "karma";
export const DECK_PREFIX = "deck";
export const DEX_PREFIX = "dex";
export const karmaCustomId = (userId, traitKey) => `${KARMA_PREFIX}:${userId}:${traitKey}`;
export function parseKarmaCustomId(id) {
  const p = id.split(":");
  if (p.length !== 3 || p[0] !== KARMA_PREFIX) return null;
  return { userId: p[1], traitKey: p[2] };
}
export const deckCustomId = (userId, page) => `${DECK_PREFIX}:${userId}:${page}`;
export const dexCustomId = (guildId, page) => `${DEX_PREFIX}:${guildId}:${page}`;
export function parsePagedCustomId(prefix, id) {
  const p = id.split(":");
  if (p.length !== 3 || p[0] !== prefix) return null;
  const page = Number(p[2]);
  if (!Number.isInteger(page) || page < 0) return null;
  return { key: p[1], page };
}

/** ◀ 이전 / 다음 ▶ 버튼 한 줄 (덱·도감 공용). 한 쪽이면 버튼 없음. */
export function pageButtons(customIdOf, page, pages) {
  if (pages <= 1) return [];
  return [{
    type: 1,
    components: [
      { type: 2, style: 2, label: "◀ 이전", custom_id: customIdOf(page - 1), disabled: page <= 0 },
      { type: 2, style: 2, label: "다음 ▶", custom_id: customIdOf(page + 1), disabled: page >= pages - 1 },
    ],
  }];
}

/** /환생 결과 임베드 (render.ts lifeEmbed) */
export function lifeEmbed(opts) {
  const { life, birthNo, traits } = opts;
  const view = viewFromLife(life, birthNo, traits, opts.rarityScore);
  const fields = [
    ...statFields(view),
    {
      name: "남은 뽑기",
      value: opts.meritLeft === null
        ? (Number.isFinite(opts.rollsLeft) ? `오늘 ${opts.rollsLeft}회` : "무제한 (테스트 모드)")
        : `오늘 ${opts.rollsLeft}회 · 공덕 ${opts.meritLeft}`,
      inline: true,
    },
  ];

  const notes = [];
  if (opts.firstInGuild) notes.push(`🌟 이 서버에서 처음 발견된 나라입니다`);
  if (opts.inheritedTrait && !opts.inheritFailed) {
    notes.push(`🔁 업 계승: ${traitText(opts.inheritedTrait)}을(를) 물려받았습니다`);
  }
  if (opts.inheritFailed && opts.inheritedTrait) {
    notes.push(`🔁 업 계승: ${traitText(opts.inheritedTrait)}을(를) 물려받지 못했습니다`);
  }
  if (opts.usedMerit) notes.push(`✨ 공덕을 써서 뽑았습니다`);
  if (notes.length) fields.push({ name: "​", value: notes.join("\n") });

  return {
    color: colorOf(life.c.pop),
    title: `${life.c.flag} ${view.genName} · ${life.c.name} · 제 ${birthNo.toLocaleString()}번 생`,
    description: opts.summary,
    fields,
    footer: { text: `${BOT_FOOTER} · ${SOURCE_NOTE}` },
  };
}
/** 업 계승 버튼들 (§C). 특성이 없으면 버튼도 없다. */
export function karmaRow(userId, traits) {
  if (!traits.length) return [];
  return [{
    type: 1,
    components: traits.slice(0, 5).map(k => ({
      type: 2, style: 2,
      custom_id: karmaCustomId(userId, k),
      label: `${traitText(k)} 이어받기`,
    })),
  }];
}

/* ── rows.ts 이식 ── */

export function rowCountry(row) {
  return countryByCode(row.country_code) ?? null;
}

/** 기록 한 줄 (덱 목록용) */
export function rowLine(row) {
  const c = rowCountry(row);
  const flag = c ? c.flag + " " : "";
  const label = row.name ? `**${row.name}**` : viewFromRow(row).genName;
  const rec = row.wins + row.losses > 0 ? ` · ${row.wins}승 ${row.losses}패` : "";
  return `\`#${row.id}\` ${flag}${label} · ${row.country_name} · ${row.lifespan}세 · ` +
    `${fmtTopPct(Number(row.rarity_score))}${rec}`;
}

/** §C /여권 — 생 상세 임베드 */
export function passportEmbed(row, ownerLabel) {
  const c = rowCountry(row);
  const flag = c ? c.flag + " " : "";
  const view = viewFromRow(row);
  const fields = [
    ...statFields(view),
    { name: "전적", value: `${row.wins}승 ${row.losses}패`, inline: true },
    {
      name: "출생",
      value: `<t:${Math.floor(new Date(row.created_at).getTime() / 1000)}:D>\n${ownerLabel}`,
      inline: true,
    },
  ];
  if (row.inherited_trait) {
    fields.push({ name: "​", value: `🔁 업 계승으로 ${traitText(row.inherited_trait)}을(를) 물려받았습니다` });
  }
  return {
    color: colorOf(c?.pop ?? 1000),
    title: `${flag}${row.name ?? view.genName} · ${row.country_name} · 제 ${row.id.toLocaleString()}번 생`,
    fields,
    footer: { text: `${BOT_FOOTER} · ${SOURCE_NOTE}` },
  };
}
