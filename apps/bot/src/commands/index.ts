/* 커맨드 레지스트리.
 * 2단계는 /환생 하나뿐이다 — /여권 /덱 /명명 /도감(3단계), /배틀(4단계)은
 * 지시받은 뒤에 여기 추가한다(§H·§I). */
import type { ChatInputCommandInteraction, SlashCommandOptionsOnlyBuilder, SlashCommandBuilder } from "discord.js";
import * as reroll from "./reroll.js";

export interface Command {
  data: SlashCommandBuilder | SlashCommandOptionsOnlyBuilder;
  execute: (i: ChatInputCommandInteraction) => Promise<void>;
}

export const commands: Command[] = [
  { data: reroll.data, execute: reroll.execute },
];

export const byName = new Map(commands.map(c => [c.data.name, c]));
