/* Pages Functions 공용 도구 — VM counter.js 의 대응 조각들.
 * 밑줄로 시작하는 파일은 라우팅되지 않는다(공용 모듈 전용).
 *
 * VM 과 다른 지점 두 가지를 여기 모아 둔다:
 *  ① 상태가 격리(isolate) 단위다. 레이트리밋 창은 격리마다 따로 돌아 전역보다 느슨한
 *    "최선 노력" 방어가 된다 — 진짜 한도는 Cloudflare WAF 룰이 담당한다(선택).
 *  ② node crypto 가 없다. HMAC 은 WebCrypto(crypto.subtle)로, 해시도 마찬가지.
 */

export function json(code, obj, extra) {
  return new Response(JSON.stringify(obj), {
    status: code,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store", ...extra },
  });
}

/* ===== 요청 몸통 =====
 * VM 은 스트림을 자르며 8KB 를 넘기면 413 을 줬다. Workers 는 몸통이 이미 도착해 있으므로
 * 읽고 나서 길이만 확인한다(메모리 폭탄은 Cloudflare 쪽 상한이 먼저 막는다). */
export const MAX_BODY = 8192;
export async function readBody(request, cap = MAX_BODY) {
  const text = await request.text();
  if (text.length > cap) return null;
  return text;
}

/* ===== HMAC 서명 (VM sign/sigOK 대응) =====
 * 키 객체는 격리 수명 동안 캐시한다 — importKey 를 요청마다 하면 그게 제일 비싸다. */
const enc = new TextEncoder();
let _keyFor = null, _key = null;
async function hmacKey(secret) {
  if (_key && _keyFor === secret) return _key;
  _key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  _keyFor = secret;
  return _key;
}
const hex = buf => [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, "0")).join("");
export async function sign(env, l) {
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(env.LIFE_SECRET), enc.encode(l));
  return hex(sig).slice(0, 16);
}
export async function sigOK(env, l, s) {
  if (!env.LIFE_SECRET || typeof l !== "string" || typeof s !== "string") return false;
  const want = await sign(env, l);
  /* 길이 고정(16) + XOR 누적 — timingSafeEqual 대응 */
  if (s.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want.charCodeAt(i) ^ s.charCodeAt(i);
  return diff === 0;
}

export function clientIp(request) {
  return request.headers.get("cf-connecting-ip")
    || (request.headers.get("x-forwarded-for") || "").split(",")[0].trim()
    || "";
}

/* ===== 방문자 근사 (일 솔트 IP 해시) =====
 * VM 은 솔트를 메모리에 뒀지만 격리가 여럿이라 그러면 같은 사람이 격리마다 다른 해시가
 * 되어 고유 방문자가 부풀려진다. 솔트는 D1 에 두고(하루 한 행) 격리별로 캐시한다.
 * INSERT OR IGNORE + 재조회라 여러 격리가 동시에 자정을 넘어도 승자는 하나다. */
export function kstDay() {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}
let _saltDay = "", _salt = "";
export async function ipHash(env, ip) {
  const day = kstDay();
  if (day !== _saltDay) {
    const fresh = hex(crypto.getRandomValues(new Uint8Array(16)).buffer);
    await env.DB.prepare("INSERT OR IGNORE INTO salts (day, salt) VALUES (?1, ?2)").bind(day, fresh).run();
    const row = await env.DB.prepare("SELECT salt FROM salts WHERE day = ?1").bind(day).first();
    _salt = (row && row.salt) || fresh;
    _saltDay = day;
  }
  const d = await crypto.subtle.digest("SHA-256", enc.encode(_salt + "|" + (ip || "")));
  return hex(d).slice(0, 16);
}

/* ===== 격리 내 레이트리밋 (고정 창, 최선 노력) =====
 * 숫자는 VM 과 같다. 격리 단위라 전역 합산은 이보다 느슨하다 — 남용 방어의 마지막 줄은
 * 대시보드의 WAF 레이트리밋 룰(무료 1개)로 건다. 창이 바뀌면 Map 을 통째로 버려 메모리가 안 샌다. */
export const TRACK_RATE_PER_MIN = 240;
export const ROLL_RATE_PER_MIN = 600;
export const MAX_N = 20;
function windowLimiter(limit) {
  let win = 0, counts = new Map();
  return (key, cost) => {
    const now = Math.floor(Date.now() / 60000);
    if (now !== win) { win = now; counts = new Map(); }
    const n = (counts.get(key) || 0) + cost;
    counts.set(key, n);
    return n > limit;
  };
}
export const trackLimited = windowLimiter(TRACK_RATE_PER_MIN);
export const rollLimited = windowLimiter(ROLL_RATE_PER_MIN);     /* roll·fortune·verify·share 공용 */
export const counterIncLimited = windowLimiter(ROLL_RATE_PER_MIN); /* inc 는 창을 따로 (VM 과 동일한 이유) */

/* base62 7자 공유 코드 (VM newCode 대응 — 충돌은 INSERT 쪽에서 재시도로 처리) */
const CODE_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
export function newCode() {
  const b = crypto.getRandomValues(new Uint8Array(7));
  let c = "";
  for (let i = 0; i < 7; i++) c += CODE_ALPHABET[b[i] % 62];
  return c;
}
