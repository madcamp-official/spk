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

main().catch((e: unknown) => {
  /* 흔한 실패는 원인이 뻔한데 스택만 길게 나와 묻힌다 — 무엇을 해야 하는지 먼저 말한다. */
  const code = (e as { code?: number }).code;
  if (code === 50001) {
    console.error("[commands] 등록 실패: Missing Access (403)");
    console.error("  → 봇이 그 서버에 없거나 applications.commands 스코프 없이 초대됐습니다.");
    /* 51968 = 채널 보기(1024) + 메시지 보내기(2048) + 임베드(16384) + 파일 첨부(32768)
       — 파일 첨부는 환생 초상 이미지에 필요하다 */
    console.error(`  → 초대 링크: https://discord.com/oauth2/authorize?client_id=${env.appId}` +
      "&permissions=51968&scope=bot%20applications.commands");
  } else if (code === 0 || (e as { status?: number }).status === 401) {
    console.error("[commands] 등록 실패: 토큰이 거부됐습니다(401). DISCORD_TOKEN을 확인하세요.");
  } else {
    console.error("[commands] 등록 실패:", e);
  }
  /* process.exit()로 즉시 끊으면 REST의 열린 핸들 때문에 Windows에서 libuv assert가 뜬다.
     종료 코드만 세워 두고 이벤트 루프가 자연히 비워지게 둔다. */
  process.exitCode = 1;
});
