/* 봇 엔트리 — 독립 장기 실행 프로세스 (§A.1)
 *
 * Next.js/서버리스에 얹지 않는다. Discord 게이트웨이에 상시 연결돼 있어야 하고,
 * 서버리스의 요청-응답 수명주기와는 애초에 맞지 않는다.
 *
 * 인텐트는 Guilds 하나뿐이다 — 슬래시 커맨드만 쓰므로(§A.7) Message Content Intent는
 * 필요 없고, 켜면 Discord 심사 대상이 되며 §I가 금지한다. */
import { Client, Events, GatewayIntentBits, MessageFlags } from "discord.js";
import { env } from "./env.js";
import { byName } from "./commands/index.js";
import { handleKarmaButton } from "./commands/reroll.js";
import { KARMA_PREFIX } from "./lib/render.js";
import { closePool, pool } from "./db/pool.js";

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, (c) => {
  console.log(`[bot] ${c.user.tag} 로그인. 커맨드 ${byName.size}개`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      const cmd = byName.get(interaction.commandName);
      if (!cmd) return;
      await cmd.execute(interaction);
      return;
    }
    if (interaction.isButton() && interaction.customId.startsWith(KARMA_PREFIX + ":")) {
      await handleKarmaButton(interaction);
      return;
    }
  } catch (e) {
    /* 인터랙션 하나가 죽어도 프로세스는 살아 있어야 한다. 사용자에게는 상태를 알린다 —
       아무 응답도 없으면 Discord가 "애플리케이션이 응답하지 않음"만 보여 준다. */
    console.error("[bot] 인터랙션 처리 실패:", e);
    if (!interaction.isRepliable()) return;
    const msg = "지금 처리에 문제가 생겼어요. 잠시 후 다시 시도해 주세요.";
    try {
      if (interaction.deferred || interaction.replied) await interaction.editReply({ content: msg });
      else await interaction.reply({ content: msg, flags: MessageFlags.Ephemeral });
    } catch { /* 인터랙션이 이미 만료됨 — 더 할 수 있는 게 없다 */ }
  }
});

async function main(): Promise<void> {
  /* DB가 안 붙으면 뜨지 않는다. 모든 상태가 DB에 있으므로(§A.4) 연결 없이 뜨면
     첫 /환생에서 전부 실패하고, 그건 사용자에게 "봇이 고장"으로만 보인다. */
  await pool.query("SELECT 1");
  console.log("[bot] DB 연결 확인");
  await client.login(env.discordToken);
}

async function shutdown(sig: string): Promise<void> {
  console.log(`[bot] ${sig} — 종료합니다`);
  try { await client.destroy(); } catch { /* 이미 끊김 */ }
  try { await closePool(); } catch { /* 이미 닫힘 */ }
  process.exit(0);
}
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));

main().catch(async (e) => {
  console.error("[bot] 기동 실패:", e);
  await closePool().catch(() => {});
  process.exit(1);
});
