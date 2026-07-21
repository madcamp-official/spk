/* /도감 — 서버 공동 국가 컬렉션 (§C, 공개 출력)
 *
 * §C는 "n/195"라고 적었지만 실제 데이터셋은 198개국이다(홍콩·마카오·대만·코소보 포함).
 * 화면에는 **데이터셋 실제 수**를 쓴다 — 195로 적으면 198번째를 모은 사람이 영원히 못 채운다.
 *
 * 페이지 버튼은 stateless다(§A.6): `dex:<길드ID>:<페이지>`. 길드를 넣는 이유는
 * 도감이 서버 단위 수집이라, 봇 재시작 뒤에도 그 버튼이 어느 서버 것인지 알아야 해서다. */
import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags,
  SlashCommandBuilder, type ButtonInteraction, type ChatInputCommandInteraction,
} from "discord.js";
import { DATA, PAGING, isoCode, type ContinentCode } from "@life-reroll/core";
import { getGuildDex } from "../db/queries.js";
import { BOT_FOOTER } from "../lib/render.js";
import { contKo } from "../lib/text.js";

export const DEX_PREFIX = "dex";
export function dexCustomId(guildId: string, page: number): string {
  return `${DEX_PREFIX}:${guildId}:${page}`;
}
export function parseDexCustomId(id: string): { guildId: string; page: number } | null {
  const p = id.split(":");
  if (p.length !== 3 || p[0] !== DEX_PREFIX) return null;
  const page = Number(p[2]);
  if (!Number.isInteger(page) || page < 0) return null;
  return { guildId: p[1]!, page };
}

export const data = new SlashCommandBuilder()
  .setName("도감")
  .setDescription("이 서버가 함께 모은 국가 컬렉션을 봅니다.");

/* 대륙 → 그 대륙의 국가들. 매번 훑지 않게 한 번만 만든다. */
const BY_CONT = new Map<ContinentCode, typeof DATA>();
for (const c of DATA) {
  const arr = BY_CONT.get(c.cont) ?? [];
  arr.push(c);
  BY_CONT.set(c.cont, arr as typeof DATA);
}
const CONT_ORDER: ContinentCode[] = ["AS", "EU", "AF", "NA", "SA", "OC"];
/* 페이지는 인구 많은 순으로 자른다 — 도감이 실제로 차는 순서와 같아 진행이 눈에 보인다 */
const SORTED = [...DATA].sort((a, b) => b.pop - a.pop);

async function buildDex(guildId: string, page: number, guildName: string) {
  const owned = await getGuildDex(guildId);
  const size = PAGING.dexPageSize;
  const pages = Math.max(1, Math.ceil(SORTED.length / size));
  const safePage = Math.min(Math.max(page, 0), pages - 1);

  const e = new EmbedBuilder()
    .setColor(0xf3c95c)
    .setTitle(`📖 ${guildName}의 환생 도감`)
    .setDescription(
      `**${owned.size} / ${DATA.length}** 개국 수집 ` +
      `(${((owned.size / DATA.length) * 100).toFixed(1)}%)`)
    .setFooter({ text: `${BOT_FOOTER} · ${safePage + 1}/${pages} 쪽 · 인구 많은 순` });

  /* 대륙별 요약 (§C) */
  e.addFields({
    name: "대륙별",
    value: CONT_ORDER.map(k => {
      const all = BY_CONT.get(k) ?? [];
      const got = all.filter(c => owned.has(isoCode(c.flag))).length;
      return `${contKo(k)} ${got}/${all.length}`;
    }).join(" · "),
  });

  const slice = SORTED.slice(safePage * size, (safePage + 1) * size);
  e.addFields({
    name: "국가",
    /* 모은 나라는 그대로, 아직인 나라는 스포일러로 가린다.
       국기도 스포일러 **안에** 넣는다 — 밖에 두면 눌러도 국기가 안 나타나서,
       "가려진 걸 열어 본다"는 동작에 아무 보상이 없다. */
    value: slice.map(c => {
      const code = isoCode(c.flag);
      return owned.has(code) ? `${c.flag} ${c.name}` : `||${c.flag} ${c.name}||`;
    }).join("\n"),
  });

  return { embed: e, pages, page: safePage };
}

function pageRow(guildId: string, page: number, pages: number): ActionRowBuilder<ButtonBuilder>[] {
  if (pages <= 1) return [];
  return [new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(dexCustomId(guildId, page - 1))
      .setLabel("◀ 이전").setStyle(ButtonStyle.Secondary).setDisabled(page <= 0),
    new ButtonBuilder().setCustomId(dexCustomId(guildId, page + 1))
      .setLabel("다음 ▶").setStyle(ButtonStyle.Secondary).setDisabled(page >= pages - 1),
  )];
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.guildId) {
    await interaction.reply({
      content: "도감은 서버 공동 수집이라 DM에서는 볼 수 없어요.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const { embed, pages, page } = await buildDex(
    interaction.guildId, 0, interaction.guild?.name ?? "이 서버");
  /* 도감은 공개다 — "우리가 얼마나 모았나"가 서버에 보여야 한다(§C) */
  await interaction.reply({ embeds: [embed], components: pageRow(interaction.guildId, page, pages) });
}

export async function handleDexButton(interaction: ButtonInteraction): Promise<void> {
  const parsed = parseDexCustomId(interaction.customId);
  if (!parsed) return;
  /* 도감은 서버 공동 자산이라 누구나 넘겨볼 수 있다 — 다만 다른 서버 버튼은 막는다 */
  if (parsed.guildId !== interaction.guildId) {
    await interaction.reply({
      content: "이 도감은 다른 서버의 것이에요.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const { embed, pages, page } = await buildDex(
    parsed.guildId, parsed.page, interaction.guild?.name ?? "이 서버");
  await interaction.update({ embeds: [embed], components: pageRow(parsed.guildId, page, pages) });
}
