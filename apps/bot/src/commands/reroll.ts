/* /환생 — 생 뽑기 (DiscordBot.md §C)
 *
 *   1일 3회, 넘으면 공덕으로 추가. 직전 생 특성 1개를 이월하는 버튼(업 계승).
 *   결과는 **공개** 출력이다 — ephemeral 금지(§C). 서버 안에서 목격되는 것이 확산 엔진이다.
 *
 * 흐름이 두 갈래인 이유:
 *   · 슬래시 커맨드로 들어오면 그냥 뽑는다.
 *   · 업 계승 버튼으로 들어오면 그 특성을 가진 생이 나올 때까지 다시 뽑는다(core가 담당).
 *   둘 다 "뽑기"라서 일일 횟수를 똑같이 차감한다 — 버튼이 무한 리롤 구멍이 되면 안 된다.
 */
import {
  MessageFlags, SlashCommandBuilder,
  type ButtonInteraction, type ChatInputCommandInteraction,
} from "discord.js";
import { MERIT, rollLife, rollLifeWithTrait } from "@life-reroll/core";
import { countRollsToday, ensureUser, getMerit, saveLife, spendMerit } from "../db/queries.js";
import { buildSummary } from "../lib/summary.js";
import { karmaRow, lifeEmbed, parseKarmaCustomId } from "../lib/render.js";
import { traitText } from "../lib/text.js";

export const data = new SlashCommandBuilder()
  .setName("환생")
  .setDescription("새로운 생을 뽑습니다. 실제 인구 분포 확률 그대로.");

/** 뽑기 권한 확인 — 오늘 남은 횟수, 없으면 공덕 차감 (§A.5 원자적). */
async function takeRollSlot(userId: string): Promise<
  | { ok: true; rollsLeft: number; usedMerit: boolean; meritLeft: number | null }
  | { ok: false; reason: string }
> {
  await ensureUser(userId);
  const used = await countRollsToday(userId);
  const free = MERIT.dailyRolls - used;
  if (free > 0) {
    /* 이 생을 저장하고 나면 free-1 이 남는다 */
    return { ok: true, rollsLeft: free - 1, usedMerit: false, meritLeft: null };
  }
  const cost = MERIT.rerollCost;
  if (cost === null) {
    /* 밸런스 미확정이면 기능을 여는 대신 솔직히 막는다(§I: 임의 확정 금지) */
    return { ok: false, reason: "오늘의 뽑기를 모두 썼습니다. 내일 다시 만나요 🌙" };
  }
  const left = await spendMerit(userId, cost);
  if (left === null) {
    const have = await getMerit(userId);
    return {
      ok: false,
      reason: `오늘의 뽑기를 모두 썼습니다. 공덕 ${cost}을 쓰면 더 뽑을 수 있어요 (현재 ${have}) 🌙`,
    };
  }
  return { ok: true, rollsLeft: 0, usedMerit: true, meritLeft: left };
}

/** 슬래시 커맨드와 버튼이 공유하는 본체. */
async function doReroll(
  interaction: ChatInputCommandInteraction | ButtonInteraction,
  inheritTrait: string | null,
): Promise<void> {
  const userId = interaction.user.id;

  /* 권한 확인은 defer 전에 한다 — 거절 메시지는 조용히(ephemeral) 보내고 싶은데,
     한 번 공개로 defer하면 그 응답은 공개로 고정되기 때문이다.
     인덱스 탄 count 한 방이라 3초 응답 창을 위협하지 않는다. */
  const slot = await takeRollSlot(userId);
  if (!slot.ok) {
    await interaction.reply({ content: slot.reason, flags: MessageFlags.Ephemeral });
    return;
  }

  /* 여기서부터가 뽑기 결과 — 공개다(§C). LLM 요약이 붙을 수 있어 defer한다. */
  await interaction.deferReply();

  const rolled = inheritTrait ? rollLifeWithTrait(inheritTrait) : { life: rollLife(), inherited: false, tries: 1 };
  const life = rolled.life;
  const inheritFailed = Boolean(inheritTrait) && !rolled.inherited;

  const saved = await saveLife({
    discordId: userId,
    guildId: interaction.guildId,
    life,
    inheritedTrait: rolled.inherited ? inheritTrait : null,
  });

  const summary = await buildSummary(life, saved.id, saved.traits, saved.rarityScore * 100);

  await interaction.editReply({
    embeds: [lifeEmbed({
      life,
      birthNo: saved.id,
      traits: saved.traits,
      rarityScore: saved.rarityScore,
      summary: summary.text,
      ownerTag: interaction.user.username,
      firstInGuild: saved.firstInGuild,
      inheritedTrait: inheritTrait,
      inheritFailed,
      usedMerit: slot.usedMerit,
      meritLeft: slot.meritLeft,
      rollsLeft: slot.rollsLeft,
    })],
    /* 다음 업 계승 버튼은 **이번 생**의 특성으로 만든다 — "직전 생 특성 이월"(§C) */
    components: karmaRow(userId, saved.traits),
  });
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  await doReroll(interaction, null);
}

/** 업 계승 버튼 처리. custom_id에 유저와 특성이 들어 있어 봇 재시작 후에도 동작한다(§A.6). */
export async function handleKarmaButton(interaction: ButtonInteraction): Promise<void> {
  const parsed = parseKarmaCustomId(interaction.customId);
  if (!parsed) return;
  /* 남의 결과에 달린 버튼을 누르는 것은 막는다 — 누른 사람의 덱에 남의 업이 들어가면 안 된다 */
  if (parsed.userId !== interaction.user.id) {
    await interaction.reply({
      content: `이 버튼은 뽑은 사람만 누를 수 있어요. \`/환생\`으로 직접 뽑아 보세요.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  await doReroll(interaction, parsed.traitKey);
}

/** 버튼 라벨에 쓰는 안내(도움말 등에서 재사용) */
export function karmaHint(traitKey: string): string {
  return `${traitText(traitKey)}을(를) 물려받은 새 생을 뽑습니다 (뽑기 1회 소모)`;
}
