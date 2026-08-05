/* Discord HTTP Interactions 엔드포인트 — apps/bot/src/index.ts 의 후계.
 *
 * VM 회수로 게이트웨이 상주 프로세스를 못 두게 되어 전송 계층을 HTTP 로 바꿨다:
 * Discord 가 인터랙션을 이 URL 로 POST 하고(개발자 포털 Interactions Endpoint URL),
 * Ed25519 서명을 검증한 뒤 3초 안에 응답한다. 지연 작업(뽑기 저장·배틀 기록)은
 * type:5 로 먼저 응답하고 waitUntil 에서 원본 메시지를 채운다(구 defer→editReply).
 *
 * 커맨드 정의·게임 규칙·DB 스키마는 그대로다 — 슬래시 커맨드는 Discord 서버에 이미
 * 등록돼 있어 재등록도 필요 없다(정의를 바꿀 때만 apps/bot 의 sync-commands 를 쓴다).
 *
 * 필요한 바인딩(wrangler pages secret put …):
 *   DISCORD_PUBLIC_KEY  개발자 포털 General Information 의 Public Key (서명 검증)
 *   DATABASE_URL        Supabase 풀러 (VM 봇과 같은 값 — 상태가 전부 여기 있다)
 *   DISCORD_TOKEN       선택 — /도감 제목의 서버 이름 조회에만 쓴다 (없으면 "이 서버")
 *   LLM_*               선택 — 없으면 템플릿 요약 (VM 운영에서도 꺼져 있었다)
 */
import { makeDb } from "./_bot/db.js";
import { eph } from "./_bot/interactions.js";
import { DECK_PREFIX, DEX_PREFIX, KARMA_PREFIX, parsePagedCustomId } from "./_bot/render.js";
import {
  btnDeck, btnDex, btnKarma, cmdBattle, cmdDeck, cmdDex, cmdName, cmdPassport, cmdReroll,
} from "./_bot/commands.js";

/* ===== Ed25519 서명 검증 =====
 * Discord 는 모든 요청에 서명을 싣고, 검증 없는 엔드포인트는 포털 등록 자체가 거부된다
 * (등록 시 위조 서명을 일부러 보내 401 을 확인한다). 키는 격리 수명 동안 캐시한다. */
const hexToBytes = (hex) => {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
};
let _vkeyFor = null, _vkey = null;
async function verifySignature(publicKeyHex, signatureHex, timestamp, body) {
  try {
    if (!_vkey || _vkeyFor !== publicKeyHex) {
      _vkey = await crypto.subtle.importKey(
        "raw", hexToBytes(publicKeyHex), { name: "Ed25519" }, false, ["verify"]);
      _vkeyFor = publicKeyHex;
    }
    return await crypto.subtle.verify(
      "Ed25519", _vkey, hexToBytes(signatureHex),
      new TextEncoder().encode(timestamp + body));
  } catch {
    return false;
  }
}

const json = (obj) => new Response(JSON.stringify(obj), {
  headers: { "content-type": "application/json" },
});

/** 커맨드 이름 → 핸들러. 정의(deploy-commands)와 이름이 어긋나면 "알 수 없는 커맨드"가 된다. */
const COMMANDS = {
  "환생": cmdReroll,
  "여권": cmdPassport,
  "덱": cmdDeck,
  "명명": cmdName,
  "도감": cmdDex,
  "배틀": cmdBattle,
};

export async function onRequestPost(context) {
  const { request, env } = context;

  const sig = request.headers.get("x-signature-ed25519");
  const ts = request.headers.get("x-signature-timestamp");
  const body = await request.text();
  if (!sig || !ts || !env.DISCORD_PUBLIC_KEY
    || !(await verifySignature(env.DISCORD_PUBLIC_KEY, sig, ts, body))) {
    return new Response("invalid request signature", { status: 401 });
  }

  const interaction = JSON.parse(body);
  if (interaction.type === 1) return json({ type: 1 });   /* PING → PONG (포털 검증) */

  const db = makeDb(env);
  const ctx = { env, db, interaction };
  let result;
  try {
    if (interaction.type === 2) {          /* 슬래시 커맨드 */
      const handler = COMMANDS[interaction.data.name];
      result = handler ? await handler(ctx) : { response: eph("알 수 없는 커맨드예요.") };
    } else if (interaction.type === 3) {   /* 버튼 (§A.6 — custom_id 가 상태 전부) */
      const id = interaction.data.custom_id || "";
      if (id.startsWith(KARMA_PREFIX + ":")) {
        result = await btnKarma(ctx);
      } else if (id.startsWith(DECK_PREFIX + ":")) {
        const parsed = parsePagedCustomId(DECK_PREFIX, id);
        result = parsed ? await btnDeck(ctx, parsed) : { response: eph("알 수 없는 버튼이에요.") };
      } else if (id.startsWith(DEX_PREFIX + ":")) {
        const parsed = parsePagedCustomId(DEX_PREFIX, id);
        result = parsed ? await btnDex(ctx, parsed) : { response: eph("알 수 없는 버튼이에요.") };
      } else {
        result = { response: eph("알 수 없는 버튼이에요.") };
      }
    } else {
      result = { response: eph("지원하지 않는 요청이에요.") };
    }
  } catch (e) {
    /* 인터랙션 하나가 죽어도 다음 요청은 살아야 한다. 아무 응답도 없으면 Discord 가
       "애플리케이션이 응답하지 않음"만 보여 준다 — 상태를 사람 말로 알린다(index.ts 와 동일). */
    console.error("[bot] 인터랙션 처리 실패:", e);
    context.waitUntil(db.end());
    return json(eph("지금 처리에 문제가 생겼어요. 잠시 후 다시 시도해 주세요."));
  }

  /* 지연 작업(구 defer→editReply). 실패해도 원본 메시지에 상태를 남긴다. */
  const after = result.after;
  context.waitUntil((async () => {
    try {
      if (after) await after();
    } catch (e) {
      console.error("[bot] 지연 작업 실패:", e);
      const { editOriginal } = await import("./_bot/interactions.js");
      await editOriginal(env, interaction,
        { content: "지금 처리에 문제가 생겼어요. 잠시 후 다시 시도해 주세요." }).catch(() => {});
    } finally {
      await db.end();
    }
  })());

  return json(result.response);
}
