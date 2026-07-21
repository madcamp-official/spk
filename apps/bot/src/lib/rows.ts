/* 저장된 기록(LifeRow)을 화면 문구로 바꾸는 계층.
 *
 * 스탯 필드 자체는 여기서 만들지 않는다 — lib/view.ts 의 statFields() 한 곳에서만 만든다.
 * /환생(core Life)과 /여권(DB 기록)이 각자 필드를 만들다가 조용히 어긋난 적이 있어서,
 * 두 입력을 LifeView로 정규화한 뒤 같은 함수를 태운다. */
import { EmbedBuilder } from "discord.js";
import { countryByCode, rarityColor } from "@life-reroll/core";
import type { LifeRow } from "../db/queries.js";
import { BOT_FOOTER } from "./render.js";
import { fmtTopPct, traitText } from "./text.js";
import { statFields, viewFromRow } from "./view.js";

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
    ...statFields(viewFromRow(row)),
    {
      name: "전적",
      /* 배틀은 4단계라 갓 뽑은 생은 0승 0패다. 자리를 미리 잡아 두면 전적이 붙어도 안 흔들린다. */
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
