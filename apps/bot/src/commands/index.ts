/* 커맨드 레지스트리.
 * 2단계: /환생 · 3단계: /여권 /덱 /명명 /도감
 * /배틀(4단계)은 지시받은 뒤에 여기 추가한다(§H·§I). */
import type {
  ChatInputCommandInteraction, SlashCommandOptionsOnlyBuilder, SlashCommandBuilder,
} from "discord.js";
import * as reroll from "./reroll.js";
import * as passport from "./passport.js";
import * as deck from "./deck.js";
import * as name from "./name.js";
import * as dex from "./dex.js";

export interface Command {
  data: SlashCommandBuilder | SlashCommandOptionsOnlyBuilder;
  execute: (i: ChatInputCommandInteraction) => Promise<void>;
}

export const commands: Command[] = [
  { data: reroll.data, execute: reroll.execute },
  { data: passport.data, execute: passport.execute },
  { data: deck.data, execute: deck.execute },
  { data: name.data, execute: name.execute },
  { data: dex.data, execute: dex.execute },
];

export const byName = new Map(commands.map(c => [c.data.name, c]));
