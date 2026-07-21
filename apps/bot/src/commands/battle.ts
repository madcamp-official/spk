/* /배틀 @유저 — 자동 판정 배틀 (DiscordBot.md §E)
 *
 *   랜덤 3축 3판 2선승. **비동기**다 — 상대의 수락을 기다리지 않고 상대 덱과 즉시 붙는다.
 *   결과는 공개다(§C). 중계 한두 문장은 사전 템플릿에서 고른다(LLM 실시간 중계는 후속 단계).
 *
 * ⚠ §E의 축 5종 중 형제 수는 빠져 있다 — 출산율 데이터가 없어 siblings가 전부 NULL이라
 *   비교가 성립하지 않는다. core/battle.ts의 AXES에 사유를 적어 두었다.
 */
import {
  EmbedBuilder, MessageFlags, SlashCommandBuilder, type ChatInputCommandInteraction,
} from "discord.js";
import {
  BATTLE, MERIT, countryByCode, drawAxes, pickBestLife, rarityColor, resolveBattle,
  type BattleStats,
} from "@life-reroll/core";
import {
  countBattlesToday, ensureUser, getBattleDeck, recordBattle, type LifeRow,
} from "../db/queries.js";
import { BOT_FOOTER } from "../lib/render.js";
import { axisDisplay, axisText } from "../lib/text.js";

export const data = new SlashCommandBuilder()
  .setName("배틀")
  .setDescription("다른 사람의 덱과 즉시 대결합니다. 상대 수락은 필요 없어요.")
  .addUserOption(o => o
    .setName("상대").setDescription("대결할 사람").setRequired(true));

/** DB 기록 → 배틀에 필요한 값. 모국 인구는 국가 코드에서 되찾는다. */
function toStats(row: LifeRow): BattleStats {
  return {
    id: row.id,
    lifeExp: Number(row.lifespan),
    income: Number(row.income_usd),
    pop: countryByCode(row.country_code)?.pop ?? 0,
    rarityScore: Number(row.rarity_score),
  };
}

/** §E 중계 — 패턴별 사전 템플릿.
 *  ⚠ 톤 가이드(§F): 국가를 비하하지 않는다. 대결은 항상 개인 생 대 생이다. */
function relay(opts: {
  winnerName: string; loserName: string; upset: boolean; close: boolean;
  flippedAxis: string | null;
}): string {
  const { winnerName, loserName, upset, close } = opts;
  if (upset) {
    return opts.flippedAxis
      ? `기울어 보이던 승부였다. ${axisText(opts.flippedAxis)}에서 흐름이 뒤집혔고, ` +
        `**${winnerName}**이(가) ${loserName}을(를) 넘어섰다.`
      : `아무도 점치지 않은 결과였다. **${winnerName}**이(가) ${loserName}을(를) 넘어섰다.`;
  }
  if (close) {
    return `마지막 판까지 갔다. **${winnerName}**이(가) 한 끗 차이로 ${loserName}을(를) 눌렀다.`;
  }
  return `처음부터 끝까지 **${winnerName}**의 흐름이었다. ${loserName}은(는) 반격할 틈이 없었다.`;
}

function lifeLabel(row: LifeRow): string {
  const c = countryByCode(row.country_code);
  return `${c ? c.flag + " " : ""}${row.name ?? row.country_name} \`#${row.id}\``;
}

export async function execute(interaction: ChatInputCommandInteraction): Promise<void> {
  const opponent = interaction.options.getUser("상대", true);
  const me = interaction.user;

  if (opponent.id === me.id) {
    await interaction.reply({ content: "자기 자신과는 겨룰 수 없어요.", flags: MessageFlags.Ephemeral });
    return;
  }
  if (opponent.bot) {
    await interaction.reply({ content: "봇과는 겨룰 수 없어요.", flags: MessageFlags.Ephemeral });
    return;
  }

  /* 상한 확인은 defer 전에 — 거절은 조용히 보내야 하는데 공개로 defer하면 되돌릴 수 없다 */
  const fought = await countBattlesToday(me.id, opponent.id);
  if (fought >= BATTLE.dailyPerOpponent) {
    await interaction.reply({
      content: `오늘 <@${opponent.id}> 님과는 이미 ${fought}번 겨뤘어요 ` +
        `(하루 ${BATTLE.dailyPerOpponent}번까지). 다른 상대를 찾아보세요.`,
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] },
    });
    return;
  }

  await ensureUser(me.id);
  const [myDeck, oppDeck] = await Promise.all([
    getBattleDeck(me.id), getBattleDeck(opponent.id),
  ]);
  if (!myDeck.length) {
    await interaction.reply({
      content: "아직 뽑은 생이 없어요. `/환생`으로 첫 생을 받아 보세요.",
      flags: MessageFlags.Ephemeral,
    });
    return;
  }
  if (!oppDeck.length) {
    await interaction.reply({
      content: `<@${opponent.id}> 님은 아직 뽑은 생이 없어요.`,
      flags: MessageFlags.Ephemeral,
      allowedMentions: { parse: [] },
    });
    return;
  }

  await interaction.deferReply();   /* 중계까지 붙으므로 defer (§C) */

  /* 축을 먼저 뽑고, 그 축에 맞는 생을 각자 덱에서 자동 선발한다 (§E "축별 최적 자동 선발").
     출전 생은 지정할 수 없다 — 상대 생을 지목하면 상대의 약한 생을 골라 붙는 셈이라
     "상대 덱을 보고 고르지 않는다"는 비동기 대결 원칙이 깨진다. 늘 각자 덱의 최적으로 붙인다. */
  const axes = drawAxes();
  const pickBest = (deck: LifeRow[]): LifeRow => {
    const best = pickBestLife(deck.map(toStats), axes);
    return deck.find(r => r.id === best!.id)!;
  };
  const mine = pickBest(myDeck);
  const theirs = pickBest(oppDeck);

  const result = resolveBattle(toStats(mine), toStats(theirs), axes);
  const iWon = result.winner === "a";
  const winnerRow = iWon ? mine : theirs;
  const loserRow = iWon ? theirs : mine;
  const winnerUserId = iWon ? me.id : opponent.id;

  /* §E 언더독 보상 — 이긴 쪽의 사전 기대 승률로 대폭/소액을 가른다 */
  const award = result.upset ? (MERIT.underdogWin ?? 0) : (MERIT.favoriteWin ?? 0);
  await ensureUser(winnerUserId);
  const rec = await recordBattle({
    lifeA: mine.id, lifeB: theirs.id,
    axes: result.axes,
    winnerLifeId: winnerRow.id,
    winnerUserId,
    loserLifeId: loserRow.id,
    loserCountryCode: loserRow.country_code,
    upset: result.upset,
    meritAward: award,
  });

  const flipped = result.rounds.find(r => r.flipped)?.axis ?? null;
  const c = countryByCode(winnerRow.country_code);
  const e = new EmbedBuilder()
    .setColor(Number.parseInt(rarityColor(c?.pop ?? 1000).slice(1), 16))
    .setTitle(`⚔️ ${result.scoreA}–${result.scoreB}  ${iWon ? me.displayName : opponent.displayName} 승`)
    .setDescription(relay({
      winnerName: winnerRow.name ?? winnerRow.country_name,
      loserName: loserRow.name ?? loserRow.country_name,
      upset: result.upset, close: result.close, flippedAxis: flipped,
    }))
    .addFields(
      { name: "출전", value: `${lifeLabel(mine)}\nvs ${lifeLabel(theirs)}`, inline: false },
      ...result.rounds.map(r => ({
        name: `${axisText(r.axis)}${r.flipped ? " ⚡" : ""}`,
        value: `${axisDisplay(r.axis, r.rawA)}\n${axisDisplay(r.axis, r.rawB)}\n` +
          `→ ${r.winner === "a" ? "◀ 승" : "승 ▶"}`,
        inline: true,
      })),
    )
    .setFooter({ text: `${BOT_FOOTER} · 사전 기대 승률 ${(result.priorA * 100).toFixed(0)}%` });

  const notes: string[] = [];
  if (result.upset) notes.push(`🔥 **언더독 승리** — 공덕 +${award} (현재 ${rec.merit})`);
  else if (award) notes.push(`✨ 공덕 +${award} (현재 ${rec.merit})`);
  if (rec.newStamp) {
    const lc = countryByCode(loserRow.country_code);
    notes.push(`📍 방문 도장: ${lc ? lc.flag + " " + lc.name : loserRow.country_name}`);
  }
  if (notes.length) e.addFields({ name: "​", value: notes.join("\n") });

  await interaction.editReply({
    content: `<@${me.id}> ⚔️ <@${opponent.id}>`,
    embeds: [e],
    allowedMentions: { parse: [] },   /* 표시만, 알림은 쏘지 않는다 */
  });
}
