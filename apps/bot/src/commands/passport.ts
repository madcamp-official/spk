/* /여권 [생번호] — 생 상세: 스탯·전적·이름 (§C)
 *
 * 생번호를 생략하면 내 최신 생. 기본은 공개이고, 조용히 보고 싶으면 비공개 옵션을 켠다
 * (§C "공개(ephemeral 옵션)"). defer는 하지 않는다 — DB 조회 한 번이라 즉시 응답한다. */
import { MessageFlags, SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { getLatestLife, getLife } from "../db/queries.js";
import { passportEmbed } from "../lib/rows.js";

export const data = new SlashCommandBuilder()
  .setName("여권")
  .setDescription("생의 상세 정보를 봅니다. 생번호를 비우면 내 최신 생.")
  .addIntegerOption(o => o
    .setName("생번호")
    .setDescription("보고 싶은 생의 출생 번호")
    .setMinValue(1)
    .setRequired(false))
  .addBooleanOption(o => o
    .setName("비공개")
    .setDescription("나에게만 보이게 합니다")
    .setRequired(false));

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const no = interaction.options.getInteger("생번호");
  const quiet = interaction.options.getBoolean("비공개") ?? false;
  const flags = quiet ? MessageFlags.Ephemeral : undefined;

  const row = no === null
    ? await getLatestLife(interaction.user.id)
    : await getLife(no);

  if (!row) {
    await interaction.reply({
      content: no === null
        ? "아직 뽑은 생이 없어요. `/환생`으로 첫 생을 받아 보세요."
        : `#${no} 번 생을 찾지 못했어요.`,
      flags: MessageFlags.Ephemeral,   /* 실패는 조용히 */
    });
    return;
  }

  /* 남의 생도 볼 수 있다(기록은 서버의 공동 자산이다). 누구 생인지는 밝혀 준다. */
  const owner = row.user_id === interaction.user.id ? "내 생" : `<@${row.user_id}>의 생`;
  await interaction.reply({
    embeds: [passportEmbed(row, owner)],
    flags,
    /* 표시용 멘션이 실제 알림을 쏘지 않게 막는다 */
    allowedMentions: { parse: [] },
  });
}
