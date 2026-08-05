/* HTTP 인터랙션 공통 도구 — discord.js 가 하던 일 중 이 봇이 실제로 쓰는 부분만.
 *
 * 응답 모양(Discord Interaction Response):
 *   {type:1}                              PONG
 *   {type:4, data:{...}}                  즉시 메시지 (flags:64 = ephemeral)
 *   {type:5, data:{flags?}}               지연 메시지("생각 중…") — 뒤에 editOriginal
 *   {type:7, data:{...}}                  버튼이 달린 메시지를 갱신 (interaction.update 대응)
 *
 * 게이트웨이 시절 defer→editReply 는 type:5 → PATCH @original 이 된다. */

export const EPHEMERAL = 64;

export const reply = (data) => ({ type: 4, data });
export const eph = (content) => ({ type: 4, data: { content, flags: EPHEMERAL } });
export const deferPublic = () => ({ type: 5 });
export const update = (data) => ({ type: 7, data });

/** 지연 응답(type:5) 뒤에 원본 메시지를 채운다. 앱 ID·토큰이 URL 에 있어 봇 토큰이 필요 없다.
 *  로컬 검증에서는 DISCORD_WEBHOOK_BASE 로 갈아끼워 가짜 Discord 로 보낸다(테스트 훅). */
export async function editOriginal(env, interaction, payload) {
  const base = env.DISCORD_WEBHOOK_BASE || "https://discord.com/api/v10";
  const r = await fetch(
    `${base}/webhooks/${interaction.application_id}/${interaction.token}/messages/@original`,
    { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
  if (!r.ok) console.error("[bot] editOriginal 실패:", r.status, await r.text().catch(() => ""));
}

/** 슬래시 옵션 꺼내기. 서브커맨드는 안 쓴다(이 봇의 커맨드는 전부 평평하다). */
export function getOption(interaction, name) {
  return (interaction.data.options ?? []).find(o => o.name === name)?.value;
}

/** 누른/보낸 사람. 길드에서는 member.user, DM 에서는 user. */
export function userOf(interaction) {
  return interaction.member?.user ?? interaction.user;
}

/** 표시 이름 — 게이트웨이의 displayName 대응(서버 별명 → 전역 이름 → 계정명). */
export function displayNameOf(interaction) {
  const u = userOf(interaction);
  return interaction.member?.nick ?? u.global_name ?? u.username;
}

/** 유저 옵션으로 지목된 상대. resolved 에 유저·멤버 정보가 실려 온다 — API 호출이 필요 없다. */
export function resolvedUser(interaction, id) {
  const u = interaction.data.resolved?.users?.[id];
  if (!u) return null;
  const nick = interaction.data.resolved?.members?.[id]?.nick;
  return { id, bot: Boolean(u.bot), displayName: nick ?? u.global_name ?? u.username };
}

/** 길드 이름. HTTP 인터랙션 페이로드에는 이름이 없어 API 로 한 번 묻고 격리 수명 동안 캐시한다.
 *  봇 토큰이 없거나 실패하면 폴백 — 도감 제목이 "이 서버"가 될 뿐 기능은 그대로다. */
const guildNames = new Map();
export async function guildNameOf(env, guildId, fallback = "이 서버") {
  if (!guildId || !env.DISCORD_TOKEN) return fallback;
  if (guildNames.has(guildId)) return guildNames.get(guildId);
  try {
    const r = await fetch(`https://discord.com/api/v10/guilds/${guildId}`, {
      headers: { authorization: `Bot ${env.DISCORD_TOKEN}` },
    });
    if (!r.ok) return fallback;
    const name = (await r.json()).name || fallback;
    guildNames.set(guildId, name);
    return name;
  } catch {
    return fallback;
  }
}
