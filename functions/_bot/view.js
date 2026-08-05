/* 생 표시의 단일 정의 — apps/bot/src/lib/view.ts 이식본.
 * /환생(core Life)과 /여권(DB LifeRow)이 같은 statFields() 를 태운다 — 원본과 같은 이유
 * (각자 필드를 만들다 조용히 어긋난 전적이 있다). 임베드 필드는 discord.js 빌더 대신
 * Discord API 의 raw JSON({name,value,inline})을 그대로 만든다 — HTTP 인터랙션은 이 모양 그대로 보낸다. */
import { altLifeName, countryByCode, formatLifeName, rollName } from "../../apps/web/core/index.js";
import { contKo, fmtTopPct, fmtUSD, traitText } from "./text.js";

/** 방금 뽑은 생 (/환생) */
export function viewFromLife(life, birthNo, traits, rarityScore) {
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

/** DB 에서 되살린 기록 (/여권 · /덱) */
export function viewFromRow(row) {
  const c = countryByCode(row.country_code);
  /* 003 이전 기록에는 생성 이름 스냅샷이 없다 — 저장된 고정값으로 core 가 재현한다
     (rollLife 와 같은 시드라 뽑던 날의 이름과 일치). */
  let genName = row.gen_name, genNameAlt = row.gen_name_alt;
  if (!genName && c) {
    const nm = rollName({ c, male: row.gender === "male", lifeExp: Number(row.lifespan),
      income: Number(row.income_usd), iq: row.iq, height: row.height_cm, weight: Number(row.weight_kg),
      eth: [row.ethnicity, 0] });
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

/** 웹의 12개 항목 + 희귀도·특성. inline 3개씩 = 정확히 3줄 (원본과 동일). */
export function statFields(v) {
  return [
    {
      name: "이름",
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
    { name: "몸", value: `${v.height}cm · ${v.weight}kg\nIQ ${v.iq}`, inline: true },
    { name: "뿌리", value: `${v.ethnicity}\n${v.religion}`, inline: true },
    {
      name: "사인",
      value: v.cause ? `${v.cause.emoji} ${v.cause.key}`.trim() : "—",
      inline: true,
    },
    {
      name: "탈모",
      value: v.balding === null ? "—" : v.balding ? "🧑‍🦲 탈모 예정" : "💇 숱 유지",
      inline: true,
    },
    { name: "희귀도", value: fmtTopPct(v.rarityScore), inline: true },
    {
      name: "특성",
      value: v.traits.length ? v.traits.map(traitText).join("\n") : "—",
      inline: true,
    },
  ];
}
