/* 커맨드 6종 + 버튼 3종 — apps/bot/src/commands/* 이식본.
 *
 * 각 핸들러는 { response, after? } 를 돌려준다:
 *   response  3초 안에 Discord 로 돌아가는 인터랙션 응답
 *   after     지연 작업(원본 defer→editReply 경로) — 엔트리가 waitUntil 로 돌리고,
 *             끝나면 editOriginal 로 원본 메시지를 채운다
 *
 * 게이트웨이판과 같은 원칙: 거절(ephemeral)은 defer 전에 판정한다 — 한 번 공개로
 * defer 하면 그 응답은 공개로 고정된다. 판정 쿼리는 한두 방이라 3초 창 안에 든다. */
import {
  BATTLE, MERIT, NAMING, PAGING, DATA, countryByCode, drawAxes, isoCode,
  pickBestLife, resolveBattle, rollLife, rollLifeWithTrait,
} from "../../apps/web/core/index.js";
import {
  countBattlesToday, countRollsToday, ensureUser, getBattleDeck, getDeck, getGuildDex,
  getLatestLife, getLife, getMerit, recordBattle, renameLife, saveLife, spendMerit,
} from "./queries.js";
import {
  deferPublic, displayNameOf, editOriginal, eph, getOption, guildNameOf,
  reply, resolvedUser, update, userOf,
} from "./interactions.js";
import {
  BOT_FOOTER, colorOf, deckCustomId, dexCustomId, karmaRow, lifeEmbed,
  pageButtons, parseKarmaCustomId, passportEmbed, rowLine,
} from "./render.js";
import { axisDisplay, axisText, fmtTopPct, fmtUSD } from "./text.js";
import { viewFromRow } from "./view.js";
import { buildSummary } from "./summary.js";

const tzOf = (env) => env.ROLL_DAY_TZ || "Asia/Seoul";

/* ===== /환생 (reroll.ts) ===== */

async function takeRollSlot(db, userId, tz) {
  await ensureUser(db, userId);
  /* VM 판의 UNLIMITED_ROLLS 테스트 스위치는 이식하지 않았다 — 운영 전용 이식본이다(§C 1일 3회). */
  const used = await countRollsToday(db, userId, tz);
  const free = MERIT.dailyRolls - used;
  if (free > 0) return { ok: true, rollsLeft: free - 1, usedMerit: false, meritLeft: null };
  const cost = MERIT.rerollCost;
  if (cost === null) {
    return { ok: false, reason: "오늘의 뽑기를 모두 썼습니다. 내일 다시 만나요 🌙" };
  }
  const left = await spendMerit(db, userId, cost);
  if (left === null) {
    const have = await getMerit(db, userId);
    return {
      ok: false,
      reason: `오늘의 뽑기를 모두 썼습니다. 공덕 ${cost}을 쓰면 더 뽑을 수 있어요 (현재 ${have}) 🌙`,
    };
  }
  return { ok: true, rollsLeft: 0, usedMerit: true, meritLeft: left };
}

/** 슬래시와 업 계승 버튼이 공유하는 본체. */
async function doReroll(ctx, inheritTrait) {
  const { db, env, interaction } = ctx;
  const user = userOf(interaction);

  const slot = await takeRollSlot(db, user.id, tzOf(env));
  if (!slot.ok) return { response: eph(slot.reason) };

  /* 여기서부터가 뽑기 결과 — 공개다(§C). 저장·요약이 붙으므로 지연 응답으로 넘긴다. */
  return {
    response: deferPublic(),
    after: async () => {
      const rolled = inheritTrait
        ? rollLifeWithTrait(inheritTrait)
        : { life: rollLife(), inherited: false, tries: 1 };
      const life = rolled.life;
      const inheritFailed = Boolean(inheritTrait) && !rolled.inherited;

      const saved = await saveLife(db, {
        discordId: user.id,
        guildId: interaction.guild_id ?? null,
        life,
        inheritedTrait: rolled.inherited ? inheritTrait : null,
      });
      /* 초상(buildPortrait)은 이식하지 않았다 — 운영 .env 에서 IMG_BASE_URL 이 꺼져 있었고
         GPU 서버(camp-4)도 VM 과 함께 회수된다. 요약은 그대로(템플릿, LLM 은 env 주입). */
      const summary = await buildSummary(env, life, saved.id, saved.traits, saved.rarityScore * 100);

      const embed = lifeEmbed({
        life,
        birthNo: saved.id,
        traits: saved.traits,
        rarityScore: saved.rarityScore,
        summary: summary.text,
        ownerTag: user.username,
        firstInGuild: saved.firstInGuild,
        inheritedTrait: inheritTrait,
        inheritFailed,
        usedMerit: slot.usedMerit,
        meritLeft: slot.meritLeft,
        rollsLeft: slot.rollsLeft,
      });
      await editOriginal(env, interaction, {
        embeds: [embed],
        /* 다음 업 계승 버튼은 **이번 생**의 특성으로 (§C "직전 생 특성 이월") */
        components: karmaRow(user.id, saved.traits),
      });
    },
  };
}

export async function cmdReroll(ctx) {
  return doReroll(ctx, null);
}

/** 업 계승 버튼. custom_id 에 유저·특성이 있어 재시작(여기서는 격리 교체) 후에도 동작한다(§A.6). */
export async function btnKarma(ctx) {
  const parsed = parseKarmaCustomId(ctx.interaction.data.custom_id);
  if (!parsed) return { response: eph("알 수 없는 버튼이에요.") };
  if (parsed.userId !== userOf(ctx.interaction).id) {
    return { response: eph("이 버튼은 뽑은 사람만 누를 수 있어요. `/환생`으로 직접 뽑아 보세요.") };
  }
  return doReroll(ctx, parsed.traitKey);
}

/* ===== /여권 (passport.ts) ===== */

export async function cmdPassport(ctx) {
  const { db, interaction } = ctx;
  const no = getOption(interaction, "생번호") ?? null;
  const quiet = getOption(interaction, "비공개") ?? false;
  const me = userOf(interaction);

  const row = no === null ? await getLatestLife(db, me.id) : await getLife(db, no);
  if (!row) {
    return {
      response: eph(no === null
        ? "아직 뽑은 생이 없어요. `/환생`으로 첫 생을 받아 보세요."
        : `#${no} 번 생을 찾지 못했어요.`),
    };
  }
  const owner = row.user_id === me.id ? "내 생" : `<@${row.user_id}>의 생`;
  return {
    response: reply({
      embeds: [passportEmbed(row, owner)],
      ...(quiet ? { flags: 64 } : {}),
      allowed_mentions: { parse: [] },
    }),
  };
}

/* ===== /명명 (name.ts) ===== */

/** 공개 임베드에 실을 수 있게 이름을 씻는다. 못 쓸 이름이면 null. (원본 그대로) */
export function sanitizeName(raw) {
  let s = raw.normalize("NFC");
  s = Array.from(s).map(ch => {
    const cp = ch.codePointAt(0);
    return (cp < 0x20 || cp === 0x7f) ? " " : ch;
  }).join("");
  s = s.replace(/[@<>`*_~|\\]/g, "");
  s = s.trim().replace(/\s+/g, " ");
  if (!s) return null;
  if (Array.from(s).length > NAMING.maxLength) return null;
  return s;
}

export async function cmdName(ctx) {
  const { db, interaction } = ctx;
  const no = getOption(interaction, "생번호");
  const raw = String(getOption(interaction, "이름") ?? "");
  const me = userOf(interaction);

  const name = sanitizeName(raw);
  if (!name) {
    return { response: eph(`그 이름은 쓸 수 없어요. 기호를 빼고 ${NAMING.maxLength}자 이내로 지어 주세요.`) };
  }
  const r = await renameLife(db, no, me.id, name);
  if (!r.ok) {
    return {
      response: eph(r.reason === "not_owner"
        ? `#${no} 번 생은 내 생이 아니에요. 내 생에만 이름을 붙일 수 있어요.`
        : `#${no} 번 생을 찾지 못했어요.`),
    };
  }
  /* 명명은 공개다(§C) — 이름이 붙는 순간이 서버에서 목격돼야 애착이 퍼진다 */
  return {
    response: reply({
      content: `<@${me.id}> 님이 제 ${no.toLocaleString()}번 생에 **${name}** 이라는 이름을 붙였습니다.`,
      embeds: [passportEmbed(r.row, "내 생")],
      allowed_mentions: { parse: [] },
    }),
  };
}

/* ===== /덱 (deck.ts) ===== */

function bestLine(label, row, value) {
  if (!row) return `${label} —`;
  const name = row.name ? `**${row.name}** ` : "";
  return `${label} ${name}\`#${row.id}\` ${row.country_name} · ${value(row)}`;
}

async function buildDeck(db, userId, page, label) {
  const size = PAGING.deckPageSize;
  const deck = await getDeck(db, userId, page, size);
  const pages = Math.max(1, Math.ceil(deck.total / size));
  const safePage = Math.min(page, pages - 1);

  const embed = {
    color: 0xf3c95c,
    title: `📇 ${label}의 덱`,
    footer: { text: `${BOT_FOOTER} · ${deck.total.toLocaleString()}개의 생 · ${safePage + 1}/${pages} 쪽` },
    fields: [],
  };
  if (!deck.total) {
    embed.description = "아직 뽑은 생이 없어요. `/환생`으로 첫 생을 받아 보세요.";
    return { embed, pages, page: safePage };
  }
  embed.fields.push({
    name: "최고 기록",
    value: [
      bestLine("⏳ 최장수", deck.best.longest, r => `${r.lifespan}세`),
      bestLine("💰 최고소득", deck.best.richest, r => `${fmtUSD(Number(r.income_usd))}/년`),
      bestLine("💎 최희귀", deck.best.rarest, r => fmtTopPct(Number(r.rarity_score))),
    ].join("\n"),
  });
  embed.fields.push({ name: "로스터", value: deck.rows.map(rowLine).join("\n") || "—" });
  return { embed, pages, page: safePage };
}

export async function cmdDeck(ctx) {
  const { db, interaction } = ctx;
  const open = getOption(interaction, "공개") ?? false;
  const me = userOf(interaction);
  const { embed, pages, page } = await buildDeck(db, me.id, 0, displayNameOf(interaction));
  return {
    response: reply({
      embeds: [embed],
      components: pageButtons(p => deckCustomId(me.id, p), page, pages),
      ...(open ? {} : { flags: 64 }),   /* §C 기본 ephemeral */
    }),
  };
}

export async function btnDeck(ctx, parsed) {
  const { db, interaction } = ctx;
  if (parsed.key !== userOf(interaction).id) {
    return { response: eph("이 덱은 다른 사람의 것이에요. `/덱`으로 내 덱을 열어 보세요.") };
  }
  const { embed, pages, page } = await buildDeck(db, parsed.key, parsed.page, displayNameOf(interaction));
  return {
    response: update({
      embeds: [embed],
      components: pageButtons(p => deckCustomId(parsed.key, p), page, pages),
    }),
  };
}

/* ===== /도감 (dex.ts) ===== */

const BY_CONT = new Map();
for (const c of DATA) {
  const arr = BY_CONT.get(c.cont) ?? [];
  arr.push(c);
  BY_CONT.set(c.cont, arr);
}
const CONT_ORDER = ["AS", "EU", "AF", "NA", "SA", "OC"];
const CONT_KO = { AS: "아시아", EU: "유럽", AF: "아프리카", NA: "북아메리카", SA: "남아메리카", OC: "오세아니아" };
/* 페이지는 인구 많은 순 — 도감이 실제로 차는 순서와 같아 진행이 눈에 보인다 */
const SORTED = [...DATA].sort((a, b) => b.pop - a.pop);

async function buildDex(db, guildId, page, guildName) {
  const owned = await getGuildDex(db, guildId);
  const size = PAGING.dexPageSize;
  const pages = Math.max(1, Math.ceil(SORTED.length / size));
  const safePage = Math.min(Math.max(page, 0), pages - 1);

  const slice = SORTED.slice(safePage * size, (safePage + 1) * size);
  const embed = {
    color: 0xf3c95c,
    title: `📖 ${guildName}의 환생 도감`,
    description: `**${owned.size} / ${DATA.length}** 개국 수집 ` +
      `(${((owned.size / DATA.length) * 100).toFixed(1)}%)`,
    footer: { text: `${BOT_FOOTER} · ${safePage + 1}/${pages} 쪽 · 인구 많은 순` },
    fields: [
      {
        name: "대륙별",
        value: CONT_ORDER.map(k => {
          const all = BY_CONT.get(k) ?? [];
          const got = all.filter(c => owned.has(isoCode(c.flag))).length;
          return `${CONT_KO[k]} ${got}/${all.length}`;
        }).join(" · "),
      },
      {
        name: "국가",
        /* 아직 못 모은 나라는 스포일러로 가린다 — 국기도 스포일러 안에(원본과 같은 이유) */
        value: slice.map(c => {
          const code = isoCode(c.flag);
          return owned.has(code) ? `${c.flag} ${c.name}` : `||${c.flag} ${c.name}||`;
        }).join("\n"),
      },
    ],
  };
  return { embed, pages, page: safePage };
}

export async function cmdDex(ctx) {
  const { db, env, interaction } = ctx;
  if (!interaction.guild_id) {
    return { response: eph("도감은 서버 공동 수집이라 DM에서는 볼 수 없어요.") };
  }
  const name = await guildNameOf(env, interaction.guild_id);
  const { embed, pages, page } = await buildDex(db, interaction.guild_id, 0, name);
  /* 도감은 공개다 — "우리가 얼마나 모았나"가 서버에 보여야 한다(§C) */
  return {
    response: reply({
      embeds: [embed],
      components: pageButtons(p => dexCustomId(interaction.guild_id, p), page, pages),
    }),
  };
}

export async function btnDex(ctx, parsed) {
  const { db, env, interaction } = ctx;
  /* 도감은 서버 공동 자산이라 누구나 넘겨볼 수 있다 — 다만 다른 서버 버튼은 막는다 */
  if (parsed.key !== interaction.guild_id) {
    return { response: eph("이 도감은 다른 서버의 것이에요.") };
  }
  const name = await guildNameOf(env, parsed.key);
  const { embed, pages, page } = await buildDex(db, parsed.key, parsed.page, name);
  return {
    response: update({
      embeds: [embed],
      components: pageButtons(p => dexCustomId(parsed.key, p), page, pages),
    }),
  };
}

/* ===== /배틀 (battle.ts) ===== */

function toStats(row) {
  return {
    id: row.id,
    lifeExp: Number(row.lifespan),
    income: Number(row.income_usd),
    pop: countryByCode(row.country_code)?.pop ?? 0,
    rarityScore: Number(row.rarity_score),
  };
}

/** §E 중계 — 패턴별 사전 템플릿. 톤 가이드(§F): 국가를 비하하지 않는다. */
function relay(opts) {
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

function lifeLabel(row) {
  const c = countryByCode(row.country_code);
  return `${c ? c.flag + " " : ""}${row.name ?? viewFromRow(row).genName} \`#${row.id}\``;
}

export async function cmdBattle(ctx) {
  const { db, env, interaction } = ctx;
  const me = userOf(interaction);
  const myName = displayNameOf(interaction);
  const oppId = getOption(interaction, "상대");
  const opponent = oppId ? resolvedUser(interaction, oppId) : null;

  if (!opponent) return { response: eph("상대를 찾지 못했어요.") };
  if (opponent.id === me.id) return { response: eph("자기 자신과는 겨룰 수 없어요.") };
  if (opponent.bot) return { response: eph("봇과는 겨룰 수 없어요.") };

  /* 상한·덱 확인은 지연 응답 전에 — 거절은 조용히 보내야 하는데 공개로 defer 하면 못 되돌린다 */
  const tz = tzOf(env);
  const fought = await countBattlesToday(db, me.id, opponent.id, tz);
  if (fought >= BATTLE.dailyPerOpponent) {
    return {
      response: reply({
        content: `오늘 <@${opponent.id}> 님과는 이미 ${fought}번 겨뤘어요 ` +
          `(하루 ${BATTLE.dailyPerOpponent}번까지). 다른 상대를 찾아보세요.`,
        flags: 64,
        allowed_mentions: { parse: [] },
      }),
    };
  }

  await ensureUser(db, me.id);
  const [myDeck, oppDeck] = await Promise.all([
    getBattleDeck(db, me.id), getBattleDeck(db, opponent.id),
  ]);
  if (!myDeck.length) {
    return { response: eph("아직 뽑은 생이 없어요. `/환생`으로 첫 생을 받아 보세요.") };
  }
  if (!oppDeck.length) {
    return {
      response: reply({
        content: `<@${opponent.id}> 님은 아직 뽑은 생이 없어요.`,
        flags: 64,
        allowed_mentions: { parse: [] },
      }),
    };
  }

  return {
    response: deferPublic(),   /* 중계까지 붙으므로 지연 (§C) */
    after: async () => {
      /* 축을 먼저 뽑고 각자 덱의 최적을 자동 선발한다 (§E — 출전 생 지정 불가). */
      const axes = drawAxes();
      const pickBest = (deck) => {
        const best = pickBestLife(deck.map(toStats), axes);
        return deck.find(r => r.id === best.id);
      };
      const mine = pickBest(myDeck);
      const theirs = pickBest(oppDeck);

      const result = resolveBattle(toStats(mine), toStats(theirs), axes);
      const iWon = result.winner === "a";
      const winnerRow = iWon ? mine : theirs;
      const loserRow = iWon ? theirs : mine;
      const winnerUserId = iWon ? me.id : opponent.id;

      const award = result.upset ? (MERIT.underdogWin ?? 0) : (MERIT.favoriteWin ?? 0);
      await ensureUser(db, winnerUserId);
      const rec = await recordBattle(db, {
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
      const fields = [
        { name: "출전", value: `${lifeLabel(mine)}\nvs ${lifeLabel(theirs)}`, inline: false },
        ...result.rounds.map(r => ({
          name: `${axisText(r.axis)}${r.flipped ? " ⚡" : ""}`,
          value: `${axisDisplay(r.axis, r.rawA)}\n${axisDisplay(r.axis, r.rawB)}\n` +
            `→ ${r.winner === "a" ? "◀ 승" : "승 ▶"}`,
          inline: true,
        })),
      ];
      const notes = [];
      if (result.upset) notes.push(`🔥 **언더독 승리** — 공덕 +${award} (현재 ${rec.merit})`);
      else if (award) notes.push(`✨ 공덕 +${award} (현재 ${rec.merit})`);
      if (rec.newStamp) {
        const lc = countryByCode(loserRow.country_code);
        notes.push(`📍 방문 도장: ${lc ? lc.flag + " " + lc.name : loserRow.country_name}`);
      }
      if (notes.length) fields.push({ name: "​", value: notes.join("\n") });

      await editOriginal(env, interaction, {
        content: `<@${me.id}> ⚔️ <@${opponent.id}>`,
        embeds: [{
          color: colorOf(c?.pop ?? 1000),
          title: `⚔️ ${result.scoreA}–${result.scoreB}  ${iWon ? myName : opponent.displayName} 승`,
          description: relay({
            winnerName: winnerRow.name ?? viewFromRow(winnerRow).genName,
            loserName: loserRow.name ?? viewFromRow(loserRow).genName,
            upset: result.upset, close: result.close, flippedAxis: flipped,
          }),
          fields,
          footer: { text: `${BOT_FOOTER} · 사전 기대 승률 ${(result.priorA * 100).toFixed(0)}%` },
        }],
        allowed_mentions: { parse: [] },   /* 표시만, 알림은 쏘지 않는다 */
      });
    },
  };
}
