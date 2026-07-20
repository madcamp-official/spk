/* /덱 — 내 로스터 + 최고 기록 3종 하이라이트 (§C)
 *
 * 기본 ephemeral이다(§C) — 남의 채널을 내 목록으로 덮지 않는다.
 * 페이지 버튼의 custom_id에 유저와 페이지를 인코딩해 봇 재시작 후에도 동작한다(§A.6). */
import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, MessageFlags,
  SlashCommandBuilder, type ButtonInteraction, type ChatInputCommandInteraction,
} from "discord.js";
import { PAGING } from "@life-reroll/core";
import { getDeck, type LifeRow } from "../db/queries.js";
import { BOT_FOOTER } from "../lib/render.js";
import { rowLine } from "../lib/rows.js";
import { fmtTopPct, fmtUSD } from "../lib/text.js";

export const DECK_PREFIX = "deck";
export function deckCustomId(userId: string, page: number): string {
  return `${DECK_PREFIX}:${userId}:${page}`;
}
export function parseDeckCustomId(id: string): { userId: string; page: number } | null {
  const p = id.split(":");
  if (p.length !== 3 || p[0] !== DECK_PREFIX) return null;
  const page = Number(p[2]);
  if (!Number.isInteger(page) || page < 0) return null;
  return { userId: p[1]!, page };
}

export const data = new SlashCommandBuilder()
  .setName("덱")
  .setDescription("내가 모은 생 목록과 최고 기록을 봅니다.")
  .addBooleanOption(o => o
    .setName("공개")
    .setDescription("채널에 공개로 보여 줍니다")
    .setRequired(false));

/** 하이라이트 한 줄 */
function bestLine(label: string, row: LifeRow | null, value: (r: LifeRow) => string): string {
  if (!row) return `${label} —`;
  const name = row.name ? `**${row.name}** ` : "";
  return `${label} ${name}\`#${row.id}\` ${row.country_name} · ${value(row)}`;
}

async function buildDeck(userId: string, page: number, label: string) {
  const size = PAGING.deckPageSize;
  const deck = await getDeck(userId, page, size);
  const pages = Math.max(1, Math.ceil(deck.total / size));
  const safePage = Math.min(page, pages - 1);

  const e = new EmbedBuilder()
    .setColor(0xf3c95c)
    .setTitle(`📇 ${label}의 덱`)
    .setFooter({ text: `${BOT_FOOTER} · ${deck.total.toLocaleString()}개의 생 · ${safePage + 1}/${pages} 쪽` });

  if (!deck.total) {
    e.setDescription("아직 뽑은 생이 없어요. `/환생`으로 첫 생을 받아 보세요.");
    return { embed: e, pages, page: safePage };
  }

  /* §C "최고 기록 3종 하이라이트" — 페이지를 넘겨도 덱 전체 기준으로 고정된다 */
  e.addFields({
    name: "최고 기록",
    value: [
      bestLine("⏳ 최장수", deck.best.longest, r => `${r.lifespan}세`),
      bestLine("💰 최고소득", deck.best.richest, r => `${fmtUSD(Number(r.income_usd))}/년`),
      bestLine("💎 최희귀", deck.best.rarest, r => fmtTopPct(Number(r.rarity_score))),
    ].join("\n"),
  });
  e.addFields({
    name: "로스터",
    value: deck.rows.map(rowLine).join("\n") || "—",
  });
  return { embed: e, pages, page: safePage };
}

function pageRow(userId: string, page: number, pages: number): ActionRowBuilder<ButtonBuilder>[] {
  if (pages <= 1) return [];
  return [new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId(deckCustomId(userId, page - 1))
      .setLabel("◀ 이전").setStyle(ButtonStyle.Secondary).setDisabled(page <= 0),
    new ButtonBuilder().setCustomId(deckCustomId(userId, page + 1))
      .setLabel("다음 ▶").setStyle(ButtonStyle.Secondary).setDisabled(page >= pages - 1),
  )];
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const open = interaction.options.getBoolean("공개") ?? false;
  const { embed, pages, page } = await buildDeck(
    interaction.user.id, 0, interaction.user.displayName ?? interaction.user.username);
  await interaction.reply({
    embeds: [embed],
    components: pageRow(interaction.user.id, page, pages),
    flags: open ? undefined : MessageFlags.Ephemeral,   /* §C 기본 ephemeral */
  });
}

export async function handleDeckButton(interaction: ButtonInteraction): Promise<void> {
  const parsed = parseDeckCustomId(interaction.customId);
  if (!parsed) return;
  /* 남의 덱을 넘겨보지 못하게. 공개로 띄운 덱이라도 조작은 주인만. */
  if (parsed.userId !== interaction.user.id) {
    await interaction.reply({
      content: "이 덱은 다른 사람의 것이에요. `/덱`으로 내 덱을 열어 보세요.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  const { embed, pages, page } = await buildDeck(
    parsed.userId, parsed.page, interaction.user.displayName ?? interaction.user.username);
  await interaction.update({ embeds: [embed], components: pageRow(parsed.userId, page, pages) });
}
