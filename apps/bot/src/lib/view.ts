/* 생을 화면에 뿌리기 위한 **단일 정의**.
 *
 * 왜 이 파일이 생겼나: /환생은 방금 뽑은 core의 Life를, /여권은 DB에서 되살린 기록(LifeRow)을
 * 그린다. 둘이 각자 임베드 필드를 만들다 보니 조용히 어긋났다 —
 * /환생에는 민족·종교·키·몸무게·IQ·사인이 아예 없었고, 탈모는 양쪽 다 빠져 있었다.
 * (웹은 칩 12개를 다 보여주는데 봇만 6개였다.)
 *
 * 그래서 두 입력을 LifeView 하나로 정규화하고, 필드는 statFields() **한 곳**에서만 만든다.
 * 항목을 더하려면 여기만 고치면 되고, 그러면 두 화면이 같이 바뀐다.
 *
 * 표시 항목은 웹의 CHIP_DEFS(apps/web/app/ui/render.js) 12개와 1:1로 맞춘다:
 *   성별·태어난 곳·모국어·민족·종교·키·몸무게·IQ·사인·탈모·기대수명·연 소득
 * 봇은 여기에 희귀도·특성을 더한다(웹은 공유 카드에서 따로 보여준다). */
import type { APIEmbedField } from "discord.js";
import { altLifeName, countryByCode, formatLifeName, rollName, type Life } from "@life-reroll/core";
import type { LifeRow } from "../db/queries.js";
import { contKo, fmtPop, fmtTopPct, fmtUSD, traitText } from "./text.js";

export interface LifeView {
  birthNo: number;
  /** 유저가 /명명으로 붙인 별명 */
  name: string | null;
  /** 태어날 때 받은 생성 이름 (ko 표기 · 반대 표기) */
  genName: string;
  genNameAlt: string | null;
  flag: string;
  countryName: string;
  cont: string;
  /** 백만 명. 국가를 못 찾으면 null */
  pop: number | null;
  urban: boolean;
  male: boolean;
  lifeExp: number;
  lang: string | null;
  income: number;
  /** 국가 1인당 GDP 대비 배수 */
  incomeMult: number;
  height: number;
  weight: number;
  iq: number;
  ethnicity: string;
  religion: string;
  /** 002_cause 이전 기록에는 없다 */
  cause: { key: string; emoji: string } | null;
  /** 옛 기록에는 없을 수 있다 */
  balding: boolean | null;
  traits: string[];
  rarityScore: number;
}

/** 방금 뽑은 생 (/환생) */
export function viewFromLife(
  life: Life, birthNo: number, traits: string[], rarityScore: number,
): LifeView {
  return {
    birthNo, name: null,
    genName: formatLifeName(life.name, "ko"),
    genNameAlt: altLifeName(life.name, "ko"),
    flag: life.c.flag, countryName: life.c.name, cont: contKo(life.c.cont),
    pop: life.c.pop, urban: life.urban,
    male: life.male, lifeExp: life.lifeExp, lang: life.c.lang,
    income: life.income, incomeMult: life.income / life.c.gdp,
    height: life.height, weight: life.weight, iq: life.iq,
    ethnicity: life.eth[0], religion: life.rel[0],
    cause: life.cause, balding: life.balding,
    traits, rarityScore,
  };
}

/** DB에서 되살린 기록 (/여권 · /덱) */
export function viewFromRow(row: LifeRow): LifeView {
  const c = countryByCode(row.country_code);
  /* 003 이전 기록에는 스냅샷이 없다. 이름 파생에 쓰는 고정값이 전부 저장돼 있으므로
     core로 그대로 되살린다 — rollLife와 같은 시드라 뽑던 날의 이름과 일치한다. */
  let genName = row.gen_name, genNameAlt = row.gen_name_alt;
  if (!genName && c) {
    const nm = rollName({ c, male: row.gender === "male", lifeExp: Number(row.lifespan),
      income: Number(row.income_usd), iq: row.iq, height: row.height_cm, weight: Number(row.weight_kg) });
    genName = formatLifeName(nm, "ko");
    genNameAlt = altLifeName(nm, "ko");
  }
  return {
    birthNo: row.id, name: row.name,
    genName: genName ?? "—", genNameAlt: genNameAlt ?? null,
    flag: c?.flag ?? "", countryName: row.country_name,
    cont: c ? contKo(c.cont) : "—", pop: c?.pop ?? null,
    urban: row.urban,
    male: row.gender === "male", lifeExp: Number(row.lifespan), lang: c?.lang ?? null,
    income: Number(row.income_usd), incomeMult: Number(row.income_mult),
    height: row.height_cm, weight: Number(row.weight_kg), iq: row.iq,
    ethnicity: row.ethnicity, religion: row.religion,
    cause: row.cause_key ? { key: row.cause_key, emoji: row.cause_emoji ?? "" } : null,
    balding: row.balding,
    traits: row.traits, rarityScore: Number(row.rarity_score),
  };
}

/** 웹의 12개 항목 + 희귀도·특성. inline 3개씩 = 정확히 3줄.
 *  이름이 1번, 성별(삶)이 2번 — 웹 칩과 같은 순서다. "태어난 곳" 항목은 이름에 자리를
 *  내주고 빠졌고, 도시/농촌·대륙은 삶 필드로 접혔다(정보 유실 없음). */
export function statFields(v: LifeView): APIEmbedField[] {
  return [
    {
      name: "이름",
      /* 유저 별명(/명명)이 있으면 그것이 주인공, 생성 이름은 괄호로.
         없으면 태어날 때 받은 이름 + 반대 표기(김희서 밑에 Heeseo Kim). */
      value: v.name
        ? `**${v.name}**\n(${v.genName})`
        : v.genName + (v.genNameAlt ? `\n${v.genNameAlt}` : ""),
      inline: true,
    },
    {
      name: "삶",
      value: `${v.male ? "남성" : "여성"} · ${v.lifeExp}세 · ${v.urban ? "도시" : "농촌"}` +
        `\n${v.cont}${v.lang ? " · " + v.lang : ""}`,
      inline: true,
    },
    {
      name: "소득",
      value: `${fmtUSD(v.income)}/년\n국가 중위의 ${v.incomeMult.toFixed(2)}배`,
      inline: true,
    },
    {
      name: "몸",
      value: `${v.height}cm · ${v.weight}kg\nIQ ${v.iq}`,
      inline: true,
    },
    {
      name: "뿌리",
      value: `${v.ethnicity}\n${v.religion}`,
      inline: true,
    },
    {
      name: "사인",
      /* 002_cause 이전에 뽑힌 생은 사인이 없다 */
      value: v.cause ? `${v.cause.emoji} ${v.cause.key}`.trim() : "—",
      inline: true,
    },
    {
      name: "탈모",
      value: v.balding === null ? "—" : v.balding ? "🧑‍🦲 탈모 예정" : "💇 숱 유지",
      inline: true,
    },
    {
      name: "희귀도",
      value: fmtTopPct(v.rarityScore),
      inline: true,
    },
    {
      name: "특성",
      /* 태그가 없어도 결핍처럼 보이지 않게 (§F 톤 가이드) */
      value: v.traits.length ? v.traits.map(traitText).join("\n") : "—",
      inline: true,
    },
  ];
}
