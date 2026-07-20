/* 저장된 기록(LifeRow)을 화면 문구로 바꾸는 계층.
 *
 * /환생은 방금 뽑은 core의 Life를 그리지만, /여권·/덱은 **DB에서 되살린 기록**을 그린다.
 * 둘의 필드명이 달라서(§G 컬럼명 vs core 이름) 변환을 여기 한곳에 모은다 —
 * 화면마다 제각기 변환하면 같은 생이 화면마다 다르게 보이기 시작한다. */
import { EmbedBuilder } from "discord.js";
import { countryByCode, rarityColor } from "@life-reroll/core";
import type { LifeRow } from "../db/queries.js";
import { BOT_FOOTER } from "./render.js";
import { contKo, fmtPop, fmtTopPct, fmtUSD, traitText } from "./text.js";

const SOURCE_NOTE = "UN WPP 2024 · World Bank 기반 추정";

/** 저장된 국가 코드로 국가를 되찾는다. 데이터셋에서 사라진 나라면 null. */
export function rowCountry(row: LifeRow) {
  return countryByCode(row.country_code) ?? null;
}

/** 기록을 한 줄로 (덱 목록용) */
export function rowLine(row: LifeRow): string {
  const c = rowCountry(row);
  const flag = c ? c.flag + " " : "";
  const name = row.name ? `**${row.name}** · ` : "";
  const rec = row.wins + row.losses > 0 ? ` · ${row.wins}승 ${row.losses}패` : "";
  return `\`#${row.id}\` ${flag}${name}${row.country_name} · ${row.lifespan}세 · ` +
    `${fmtTopPct(Number(row.rarity_score))}${rec}`;
}

/** §C /여권 — 생 상세: 스탯·전적·이름 */
export function passportEmbed(row: LifeRow, ownerLabel: string): EmbedBuilder {
  const c = rowCountry(row);
  const flag = c ? c.flag + " " : "";
  const title = row.name
    ? `${flag}${row.name}`
    : `${flag}${row.country_name} · 제 ${row.id.toLocaleString()}번 생`;

  const e = new EmbedBuilder()
    .setColor(Number.parseInt(rarityColor(c?.pop ?? 1000).slice(1), 16))
    .setTitle(title)
    .setFooter({ text: `${BOT_FOOTER} · ${SOURCE_NOTE}` });

  if (row.name) e.setDescription(`${row.country_name} · 제 ${row.id.toLocaleString()}번 생`);

  e.addFields(
    {
      name: "태어난 곳",
      value: `${c ? contKo(c.cont) : "—"} · ${row.urban ? "도시" : "농촌"}` +
        (c ? `\n인구 ${fmtPop(c.pop)}` : ""),
      inline: true,
    },
    {
      name: "삶",
      value: `${row.gender === "male" ? "남성" : "여성"} · ${row.lifespan}세` +
        (c ? `\n${c.lang}` : ""),
      inline: true,
    },
    {
      name: "소득",
      value: `${fmtUSD(Number(row.income_usd))}/년\n국가 중위의 ${Number(row.income_mult).toFixed(2)}배`,
      inline: true,
    },
    {
      name: "몸",
      value: `${row.height_cm}cm · ${row.weight_kg}kg\nIQ ${row.iq}`,
      inline: true,
    },
    {
      name: "뿌리",
      value: `${row.ethnicity}\n${row.religion}`,
      inline: true,
    },
    {
      name: "희귀도",
      value: fmtTopPct(Number(row.rarity_score)),
      inline: true,
    },
    {
      name: "특성",
      /* 특성이 없어도 결핍처럼 보이지 않게 (§F 톤 가이드) */
      value: row.traits.length ? row.traits.map(traitText).join("\n") : "—",
      inline: true,
    },
    {
      name: "전적",
      /* 배틀은 4단계라 지금은 항상 0승 0패다. 미리 자리를 잡아 두면 그때 화면이 안 흔들린다. */
      value: `${row.wins}승 ${row.losses}패`,
      inline: true,
    },
    {
      name: "출생",
      value: `<t:${Math.floor(new Date(row.created_at).getTime() / 1000)}:D>\n${ownerLabel}`,
      inline: true,
    },
  );

  if (row.inherited_trait) {
    e.addFields({ name: "​", value: `🔁 업 계승으로 ${traitText(row.inherited_trait)}을(를) 물려받았습니다` });
  }
  return e;
}
