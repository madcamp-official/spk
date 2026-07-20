/* /환생 결과 임베드와 업 계승 버튼.
 *
 * §C 규약:
 *   · 결과 임베드에 봇 초대 링크를 넣지 않는다. footer에는 봇 이름만.
 *   · 뽑기 결과는 공개 출력이다(ephemeral 금지) — 서버 안에서 목격되는 것이 확산 엔진이다.
 * §A.6: 버튼 custom_id에 상태를 인코딩한다 — 봇이 재시작해도 눌리면 동작해야 한다. */
import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder,
} from "discord.js";
import type { Life } from "@life-reroll/core";
import { rarityColor } from "@life-reroll/core";
import { contKo, fmtIncomeMult, fmtPop, fmtTopPct, fmtUSD, traitText } from "./text.js";

export const BOT_FOOTER = "환생 시뮬레이터";
/** 스탯 출처 명시는 톤 가이드(§F) 요구사항이다 — 빼지 말 것. */
const SOURCE_NOTE = "UN WPP 2024 · World Bank 기반 추정";

/** 업 계승 버튼의 custom_id. `karma:<유저ID>:<특성키>` (§A.6 stateless) */
export const KARMA_PREFIX = "karma";
export function karmaCustomId(userId: string, traitKey: string): string {
  return `${KARMA_PREFIX}:${userId}:${traitKey}`;
}
export function parseKarmaCustomId(id: string): { userId: string; traitKey: string } | null {
  const p = id.split(":");
  if (p.length !== 3 || p[0] !== KARMA_PREFIX) return null;
  return { userId: p[1]!, traitKey: p[2]! };
}

export function lifeEmbed(opts: {
  life: Life;
  birthNo: number;
  traits: string[];
  rarityScore: number;
  summary: string;
  ownerTag: string;
  firstInGuild: boolean;
  inheritedTrait: string | null;
  inheritFailed: boolean;
  usedMerit: boolean;
  meritLeft: number | null;
  rollsLeft: number;
}): EmbedBuilder {
  const { life, birthNo, traits } = opts;
  const e = new EmbedBuilder()
    /* 희귀도 색은 웹과 같은 척도를 쓴다(core.rarityColor) — 두 화면이 같은 뜻을 갖는다 */
    .setColor(Number.parseInt(rarityColor(life.c.pop).slice(1), 16))
    .setTitle(`${life.c.flag} ${life.c.name} · 제 ${birthNo.toLocaleString()}번 생`)
    .setDescription(opts.summary)
    .addFields(
      {
        name: "태어난 곳",
        value: `${contKo(life.c.cont)} · ${life.urban ? "도시" : "농촌"}\n인구 ${fmtPop(life.c.pop)}`,
        inline: true,
      },
      {
        name: "삶",
        value: `${life.male ? "남성" : "여성"} · ${life.lifeExp}세\n${life.c.lang}`,
        inline: true,
      },
      {
        name: "소득",
        value: `${fmtUSD(life.income)}/년\n${fmtIncomeMult(life)}`,
        inline: true,
      },
      {
        name: "희귀도",
        value: `${fmtTopPct(opts.rarityScore)}`,
        inline: true,
      },
      {
        name: "특성",
        /* 태그가 없어도 결핍처럼 보이지 않게 쓴다(§F 톤 가이드) */
        value: traits.length ? traits.map(traitText).join("\n") : "—",
        inline: true,
      },
      {
        name: "남은 뽑기",
        value: opts.meritLeft === null
          ? `오늘 ${opts.rollsLeft}회`
          : `오늘 ${opts.rollsLeft}회 · 공덕 ${opts.meritLeft}`,
        inline: true,
      },
    )
    .setFooter({ text: `${BOT_FOOTER} · ${SOURCE_NOTE}` });

  const notes: string[] = [];
  if (opts.firstInGuild) notes.push(`🌟 이 서버에서 처음 발견된 나라입니다`);
  if (opts.inheritedTrait && !opts.inheritFailed) {
    notes.push(`🔁 업 계승: ${traitText(opts.inheritedTrait)}을(를) 물려받았습니다`);
  }
  if (opts.inheritFailed && opts.inheritedTrait) {
    /* 실패를 성공인 척하지 않는다 — 물려받지 못했으면 그렇게 말한다 */
    notes.push(`🔁 업 계승: ${traitText(opts.inheritedTrait)}을(를) 물려받지 못했습니다`);
  }
  if (opts.usedMerit) notes.push(`✨ 공덕을 써서 뽑았습니다`);
  if (notes.length) e.addFields({ name: "​", value: notes.join("\n") });

  return e;
}

/** 직전 생의 특성 중 하나를 골라 이월하는 버튼들 (§C).
 *  특성이 없으면 버튼도 없다 — 빈 줄을 만들지 않는다. */
export function karmaRow(userId: string, traits: string[]): ActionRowBuilder<ButtonBuilder>[] {
  if (!traits.length) return [];
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    ...traits.slice(0, 5).map(k =>          /* 한 줄에 5개까지 */
      new ButtonBuilder()
        .setCustomId(karmaCustomId(userId, k))
        .setLabel(`${traitText(k)} 이어받기`)
        .setStyle(ButtonStyle.Secondary)),
  );
  return [row];
}
