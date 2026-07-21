/* /명명 <생번호> <이름> — 생에 이름 붙이기 (§C, 공개 출력)
 *
 * 이름은 유저가 쓴 글이 공개 임베드에 실리는 유일한 통로다. 그래서 여기서만
 * 입력을 씻는다: 멘션·링크 유발 문자를 막고, 길이를 제한하고, 제어문자를 지운다.
 * (allowedMentions로 알림은 막지만, @everyone 같은 글자가 그대로 보이는 것 자체가 소음이다.) */
import { MessageFlags, SlashCommandBuilder, type ChatInputCommandInteraction } from "discord.js";
import { NAMING } from "@life-reroll/core";
import { renameLife } from "../db/queries.js";
import { passportEmbed } from "../lib/rows.js";

export const data = new SlashCommandBuilder()
  .setName("명명")
  .setDescription("내 생에 이름을 붙입니다.")
  .addIntegerOption(o => o
    .setName("생번호").setDescription("이름을 붙일 생의 출생 번호")
    .setMinValue(1).setRequired(true))
  .addStringOption(o => o
    .setName("이름").setDescription(`붙일 이름 (${NAMING.maxLength}자 이내)`)
    .setMaxLength(NAMING.maxLength).setRequired(true));

/** 공개 임베드에 실을 수 있게 이름을 씻는다. 못 쓸 이름이면 null. */
export function sanitizeName(raw: string): string | null {
  let s = raw.normalize("NFC");
  /* 제어문자·줄바꿈은 지우지 않고 **공백으로 바꾼다**. 임베드 한 줄을 깨뜨리므로 없애야
     하지만, 그냥 지우면 "가\n나"가 "가나"로 붙어 뜻이 달라진다. 아래에서 공백을 접는다. */
  s = Array.from(s).map(ch => {
    const cp = ch.codePointAt(0)!;
    return (cp < 0x20 || cp === 0x7f) ? " " : ch;
  }).join("");
  /* 마크다운·멘션 유발 문자를 지운다. 남기고 이스케이프하는 것보다 단순하고,
     이름에 이런 글자가 꼭 필요한 경우가 없다. */
  s = s.replace(/[@<>`*_~|\\]/g, "");
  s = s.trim().replace(/\s+/g, " ");
  if (!s) return null;
  if (Array.from(s).length > NAMING.maxLength) return null;
  return s;
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const no = interaction.options.getInteger("생번호", true);
  const raw = interaction.options.getString("이름", true);

  const name = sanitizeName(raw);
  if (!name) {
    await interaction.reply({
      content: `그 이름은 쓸 수 없어요. 기호를 빼고 ${NAMING.maxLength}자 이내로 지어 주세요.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  const r = await renameLife(no, interaction.user.id, name);
  if (!r.ok) {
    await interaction.reply({
      content: r.reason === "not_owner"
        ? `#${no} 번 생은 내 생이 아니에요. 내 생에만 이름을 붙일 수 있어요.`
        : `#${no} 번 생을 찾지 못했어요.`,
      flags: MessageFlags.Ephemeral,
    });
    return;
  }

  /* 명명은 공개다(§C) — 이름이 붙는 순간이 서버에서 목격돼야 애착이 퍼진다 */
  await interaction.reply({
    content: `<@${interaction.user.id}> 님이 제 ${no.toLocaleString()}번 생에 **${name}** 이라는 이름을 붙였습니다.`,
    embeds: [passportEmbed(r.row, "내 생")],
    allowedMentions: { parse: [] },
  });
}
