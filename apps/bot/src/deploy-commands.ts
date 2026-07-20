/* 슬래시 커맨드 등록 (§A.7)
 *
 *   pnpm -F @life-reroll/bot sync-commands
 *
 * DEV_GUILD_ID 가 있으면 **길드 스코프**로 등록한다 — 즉시 반영된다.
 * 전역 등록은 캐시 때문에 최대 1시간이 걸려 개발 중에는 못 쓴다.
 * 운영 배포 때만 DEV_GUILD_ID를 비우고 전역으로 올린다. */
import { REST, Routes } from "discord.js";
import { env } from "./env.js";
import { commands } from "./commands/index.js";

async function main(): Promise<void> {
  const body = commands.map(c => c.data.toJSON());
  const rest = new REST().setToken(env.discordToken);

  if (env.devGuildId) {
    await rest.put(Routes.applicationGuildCommands(env.appId, env.devGuildId), { body });
    console.log(`[commands] 길드 ${env.devGuildId} 에 ${body.length}개 등록 (즉시 반영)`);
  } else {
    await rest.put(Routes.applicationCommands(env.appId), { body });
    console.log(`[commands] 전역 ${body.length}개 등록 — 반영까지 최대 1시간`);
  }
  for (const c of body) console.log(`  /${c.name}`);
}

main().catch((e) => { console.error("[commands] 등록 실패:", e); process.exit(1); });
