'use strict';
/*
 * 모두의 환생 횟수 카운터 + 이벤트 수집 + 생 뽑기/서명.
 * 의존성 없는 단일 Node 프로세스. nginx가 /api/ 를 이 포트로 프록시한다.
 *
 *   GET  /api/counter      -> {"total":N}
 *   POST /api/counter/inc  -> {"total":N+1}
 *   POST /api/track        -> 204 (이벤트 1개 또는 배열을 JSONL로 append)
 *   GET  /api/roll?n=20    -> {"lives":[{"l":"KR-1-...","sig":"a3f9..."}, ...]}
 *   GET  /api/fortune?...  -> {"l":"...","sig":"..."}  (날짜+기기 시드라 하루 동안 같은 값)
 *   POST /api/verify       -> {"ok":true|false}
 *   POST /api/share        -> {"code":"Xa9k2p"}  (서명된 생을 저장하고 짧은 코드 발급)
 *   GET  /api/shared?s=... -> {"l":"...","sig":"..."}  (코드로 생을 꺼낸다)
 *
 * ===== 왜 서버가 생을 뽑는가 =====
 * 공유 링크(?l=)는 생의 값을 그대로 싣는다. 값만 보고는 "정말 뽑힌 생인가"를 알 수 없어서
 * 손으로 모나코·IQ150을 적어 넣으면 진짜처럼 보인다. 브라우저에서 해시를 붙여도 소용없다 —
 * 그 키가 JS에 실려 나가므로 위조하는 쪽도 똑같이 서명할 수 있다.
 * 서버가 클라이언트가 보낸 생에 도장만 찍어주는 것도 무의미하다(가짜에도 찍어준다).
 * 서명이 뜻을 가지려면 서명하는 쪽이 값을 직접 만들어야 한다. 그래서 여기서 뽑는다.
 *
 * 보증 범위: "이 생을 서버가 실제로 뽑았다"까지다. "몇 번 만에 뽑았다"는 보증하지 않는다 —
 * /api/roll을 계속 불러 제일 희귀한 걸 골라 공유할 수는 있다. 그건 리롤을 많이 누른 것과
 * 같아서 막을 것도 아니고, 애초에 존재하지 않는 확률을 지어내는 것과는 다른 문제다.
 *
 * counter 레이트리밋은 nginx(limit_req)가 담당한다.
 * /api/track은 배치 전송이라 counter와 트래픽 모양이 완전히 달라서(한 번에 최대 50개,
 * pagehide 때 몰림) 같은 limit_req 존을 쓰면 정상 배치가 503으로 잘린다.
 * 그래서 여기서 자체 리밋을 건다. nginx에 /api/track 전용 존을 따로 두면 더 좋다.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { pathToFileURL } = require('url');

const HOST = process.env.COUNTER_HOST || '127.0.0.1';
const PORT = Number(process.env.COUNTER_PORT || 1558);
const FILE = process.env.COUNTER_FILE || '/var/lib/life-reroll/counter.json';
const EVENTS_FILE = process.env.EVENTS_FILE || '/var/lib/life-reroll/events.jsonl';
const MAX_BODY = 8192;      /* suggest 본문(80자) 포함 배치 50개도 충분히 들어간다 */
const MAX_BATCH = 50;
const RATE_PER_MIN = Number(process.env.TRACK_RATE_PER_MIN || 240); /* IP당 분당 이벤트 */
/* 생 뽑기는 track과 트래픽 모양이 달라서(선불로 20개씩) 창을 따로 센다.
   200,000분의 1인 모나코를 갈아서 낚으려면 이 리밋으로 5시간이 넘는다. */
const ROLL_RATE_PER_MIN = Number(process.env.ROLL_RATE_PER_MIN || 600);
const MAX_N = 20;
/* ===== 결과별 OG 이미지(오늘의 운세 공유 카드) =====
   크롤러(카톡·트위터 등)는 JS를 실행하지 않으므로, 공유 링크가 이 생의 운세 카드를 미리보기로
   보여주려면 서버가 결과별 og:image를 서빙해야 한다. 서버는 이 카드를 그릴 수 없다(canvas 없음,
   의존성 무). 그래서 클라이언트가 그려 올린 PNG/JPEG를 코드별 파일로 저장하고, /api/og로 되돌려준다.
   /s/<code> 는 크롤러용 미끼 랜딩이다 — og만 박고 사람은 JS로 /?s=code 앱으로 넘긴다. */
const OG_DIR = process.env.OG_DIR || path.join(path.dirname(process.env.SHARES_FILE || '/var/lib/life-reroll/shares.jsonl'), 'og');
const MAX_OG_BYTES = Number(process.env.MAX_OG_BYTES || 1500000);   /* 디코드된 이미지 상한(1.5MB) */
/* 본문 상한: og가 base64라 디코드본보다 ~33% 크다(+ JSON 여백). 디코드 상한으로 본문을 자르면
   상한에 가까운 정상 이미지가 통째로 413난다. nginx client_max_body_size도 이보다 커야 한다(2m). */
const MAX_OG_BODY = Math.ceil(MAX_OG_BYTES * 4 / 3) + 16384;
const MAX_OG_FILES = Number(process.env.MAX_OG_FILES || 20000);     /* 디스크 상한 — 넘으면 오래된 것부터 지운다 */
/* 절대 URL(og:image, og:url)에 쓸 정본 호스트. Host 헤더를 믿지 않는다 — CF 터널·프록시를
   지나며 바뀔 수 있고, 크롤러가 엉뚱한 호스트의 이미지를 물면 미리보기가 깨진다. */
const CANON_HOST = process.env.CANON_HOST || 'life-reroll.com';
/* 서명 키. 비어 있으면 서명 기능 전체를 끈다(로컬에서 index.html만 띄우는 경우).
   재시작마다 바뀌면 어제 뿌린 링크가 전부 '위조'로 찍히므로 반드시 고정값을 준다. */
const SECRET = process.env.LIFE_SECRET || '';
/* 클라이언트 소스를 그대로 import한다 — 뽑기 로직이 서버와 브라우저에서 갈라지면
   서명은 통과하는데 확률 분포가 다른, 아무도 못 잡는 버그가 된다. */
const APP_JS_DIR = process.env.APP_JS_DIR || path.join(__dirname, '..', 'app');

let total = 0;
try {
  const n = JSON.parse(fs.readFileSync(FILE, 'utf8')).total;
  if (Number.isFinite(n) && n >= 0) total = Math.floor(n);
} catch (e) {
  if (e.code !== 'ENOENT') console.error('[counter] 기존 값 읽기 실패, 0에서 시작:', e.message);
}

/* 매 증가마다 디스크를 때리지 않도록 모아서 쓴다. rename은 원자적이라 중간에 죽어도
   파일이 반쯤 쓰인 상태로 남지 않는다. */
let dirty = false;
function save() {
  if (!dirty) return;
  dirty = false;
  try {
    fs.mkdirSync(path.dirname(FILE), { recursive: true });
    const tmp = FILE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify({ total }));
    fs.renameSync(tmp, FILE);
  } catch (e) {
    dirty = true;
    console.error('[counter] 저장 실패:', e.message);
  }
}
setInterval(save, 2000);

/* ===== 공유 링크 저장 (짧은 코드 ↔ 생) =====
   예전엔 생 값을 URL에 통째로 실었다(?l=KR-1-0-…&sig=…). 짧은 코드(?s=Xa9k2p)로 바꾸려면
   코드→생을 어딘가 저장해야 한다. events처럼 append-only JSONL에 남기고 부팅 때 Map으로 읽는다.
   한 줄 ~40바이트라 10만 건이라도 4MB 남짓 — 캠프 규모에선 만료를 안 넣어도 된다.
   저장하는 값은 서명을 통과한 생뿐이라(handleShare 참조) 남이 아무 문자열이나 넣어 채울 수 없다. */
const SHARES_FILE = process.env.SHARES_FILE || '/var/lib/life-reroll/shares.jsonl';
const shares = new Map();   /* code -> encoded life string */
/* 운세 공유만의 곁들이 데이터: 랜딩(/s/code)에 박을 og 제목·설명·이미지 확장자.
   결과 카드 공유(og 없음)는 이 맵에 없다 — 그때 랜딩은 일반 문구로 떨어진다. */
const ogMeta = new Map();   /* code -> {t, d, x}  (title, desc, ext) */
try {
  for (const line of fs.readFileSync(SHARES_FILE, 'utf8').split('\n')) {
    if (!line) continue;
    try {
      const r = JSON.parse(line);
      if (r && r.c && r.l) {
        shares.set(r.c, r.l);
        if (r.t || r.d || r.x) ogMeta.set(r.c, { t: r.t || '', d: r.d || '', x: r.x || '' });
      }
    } catch (_) {}
  }
  console.log(`[counter] 공유 링크 ${shares.size}건 로드 (운세 og ${ogMeta.size}건)`);
} catch (e) {
  if (e.code !== 'ENOENT') console.error('[counter] 공유 링크 읽기 실패:', e.message);
}
/* base62 7자 = 62^7 ≈ 3.5조. 충돌은 사실상 없지만, 있으면 다시 뽑는다. */
const CODE_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
function newCode() {
  let c;
  do {
    const b = crypto.randomBytes(7);
    c = '';
    for (let i = 0; i < 7; i++) c += CODE_ALPHABET[b[i] % 62];
  } while (shares.has(c));
  return c;
}

function shutdown() { save(); process.exit(0); }
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

/* ===== 방문자 근사 =====
   원 IP는 저장하지 않는다. 솔트를 매일 갈아끼우므로 어제 해시와 오늘 해시는 이어붙일 수
   없다("오늘의 고유 방문자"는 세지만 개인 추적은 불가). 솔트는 메모리에만 둔다 —
   재시작하면 그날 해시가 갈리지만, 그건 IP를 남기지 않기 위해 치르는 값이다. */
let saltDay = '';
let salt = '';
/* 하루의 경계는 KST 자정. UTC로 끊으면 경계가 오전 9시가 되어 한창 쓰는 시간에
   고유 방문자 집계가 리셋된다(같은 사람이 오전 8시·10시에 오면 2명으로 잡힌다).
   tools/analyze.py 의 day_of 와 반드시 같은 기준이어야 한다 — 어긋나면 한 버킷 안에
   서로 다른 솔트의 해시가 섞여 고유 방문자가 부풀려진다. 한국은 서머타임이 없어 +9 고정. */
function kstDay() {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}
function ipHash(ip) {
  const day = kstDay();
  if (day !== saltDay) { saltDay = day; salt = crypto.randomBytes(16).toString('hex'); }
  return crypto.createHash('sha256').update(salt + '|' + (ip || '')).digest('hex').slice(0, 16);
}

/* Cloudflare Tunnel을 지나므로 req.socket 주소는 항상 127.0.0.1이다.
   실제 클라이언트는 CF-Connecting-IP에만 있다. */
function clientIp(req) {
  return req.headers['cf-connecting-ip']
    || (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
    || req.socket.remoteAddress || '';
}

/* ===== 자체 레이트리밋 (고정 창) =====
   해시 키로 세므로 원 IP를 들고 있지 않다. 창이 바뀌면 통째로 버려서 메모리도 안 샌다. */
let rlWindow = 0;
let rlCounts = new Map();
function rateLimited(key, cost) {
  const now = Math.floor(Date.now() / 60000);
  if (now !== rlWindow) { rlWindow = now; rlCounts = new Map(); }
  const n = (rlCounts.get(key) || 0) + cost;
  rlCounts.set(key, n);
  return n > RATE_PER_MIN;
}

/* 뽑기는 track과 창을 따로 쓴다 — 같이 세면 리롤을 많이 한 사람의 이벤트가 버려진다 */
let rollWindow = 0;
let rollCounts = new Map();
function rollLimited(key, cost) {
  const now = Math.floor(Date.now() / 60000);
  if (now !== rollWindow) { rollWindow = now; rollCounts = new Map(); }
  const n = (rollCounts.get(key) || 0) + cost;
  rollCounts.set(key, n);
  return n > ROLL_RATE_PER_MIN;
}

/* ===== 뽑기 모듈 =====
   클라이언트 소스(ESM)를 그대로 쓴다. CJS에서는 동적 import만 가능해서 비동기로 들어온다 —
   로드 전에 들어온 요청은 503을 받고, 클라이언트는 그동안 로컬 뽑기로 버틴다. */
let APP = null;
(async () => {
  const u = n => pathToFileURL(path.join(APP_JS_DIR, n)).href;
  /* app/을 역할별 폴더로 나눈 뒤 경로가 바뀌었다: 뽑기 로직은 engine/, 공용 유틸은 core/.
     이 파일들의 내부 import(../core/…)는 각자 새 위치 기준으로 알아서 풀린다. */
  const [roll, perma, util] = await Promise.all([
    import(u('engine/roll.js')), import(u('engine/permalink.js')), import(u('core/util.js')),
  ]);
  APP = { rollLife: roll.rollLife, encodeLife: perma.encodeLife,
          setRNG: util.setRNG, mulberry32: util.mulberry32, strHash: util.strHash };
  console.log('[counter] 뽑기 모듈 로드 완료' +
    (SECRET ? '' : ' — LIFE_SECRET이 비어 있어 서명·검증은 꺼짐(공유 링크가 전부 미검증이 된다)'));
})().catch(e => console.error('[counter] 뽑기 모듈 로드 실패 — /api/roll은 503:', e.message));

function sign(l) { return crypto.createHmac('sha256', SECRET).update(l).digest('hex').slice(0, 16); }
/* 상수시간 비교. 길이가 다르면 timingSafeEqual이 throw하므로 먼저 거른다. */
function sigOK(l, s) {
  if (!SECRET || typeof l !== 'string' || typeof s !== 'string') return false;
  const a = Buffer.from(sign(l)), b = Buffer.from(s);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function handleRoll(req, res, q) {
  if (!APP || !SECRET) return json(res, 503, { error: 'unavailable' });
  const n = Math.min(MAX_N, Math.max(1, Math.floor(Number(q.get('n'))) || 1));
  if (rollLimited(ipHash(clientIp(req)), n)) return json(res, 429, { error: 'slow down' });
  const lives = [];
  for (let i = 0; i < n; i++) {
    const l = APP.encodeLife(APP.rollLife());
    lives.push({ l, sig: sign(l) });
  }
  json(res, 200, { lives });
}

/* 클라이언트의 '오늘'은 그 기기의 시간대 기준이라 서버 UTC와 최대 하루 어긋난다.
   그렇다고 아무 날짜나 받아주면 날짜를 갈아가며 희귀한 운세를 낚을 수 있어서 ±36h만 받는다
   (시간대 최대 ±14h + 하루). */
function nearToday(key) {
  const [y, m, d] = key.split('-').map(Number);
  if (m < 1 || m > 12 || d < 1 || d > 31) return false;
  return Math.abs(Date.UTC(y, m - 1, d) - Date.now()) <= 36 * 3600 * 1000;
}
function handleFortune(req, res, q) {
  if (!APP || !SECRET) return json(res, 503, { error: 'unavailable' });
  const dev = String(q.get('dev') || ''), key = String(q.get('key') || '');
  if (!/^[a-z0-9]{1,16}$/i.test(dev)) return json(res, 400, { error: 'bad dev' });
  if (!/^\d{4}-\d{1,2}-\d{1,2}$/.test(key) || !nearToday(key)) return json(res, 400, { error: 'bad key' });
  if (rollLimited(ipHash(clientIp(req)), 1)) return json(res, 429, { error: 'slow down' });
  /* setRNG는 util.js의 모듈 전역이다. 아래 구간에 await가 없어야 다른 요청이 끼어들지 못한다 —
     하나라도 넣으면 남의 운세가 내 시드로 뽑힌다. */
  const rng = APP.mulberry32(APP.strHash(key + '|' + dev));
  let l;
  APP.setRNG(rng);
  try { l = APP.encodeLife(APP.rollLife()); } finally { APP.setRNG(Math.random); }
  json(res, 200, { l, sig: sign(l) });
}

function handleVerify(req, res, q) {
  if (!SECRET) return json(res, 503, { error: 'unavailable' });
  if (rollLimited(ipHash(clientIp(req)), 1)) return json(res, 429, { error: 'slow down' });
  json(res, 200, { ok: sigOK(String(q.get('l') || ''), String(q.get('sig') || '')) });
}

/* POST /api/share  body {l, sig} -> {code}
   서명이 유효한 생만 저장한다 — 그래서 코드로 꺼낸 생은 다시 검증할 필요가 없다(저장됐다는 게
   곧 서버가 뽑았다는 증거). 서명이 꺼져 있거나(로컬) 위조면 저장하지 않고, 클라이언트는
   예전처럼 생 없는 링크로 떨어진다. */
function handleShare(req, res) {
  if (!SECRET) return json(res, 503, { error: 'unavailable' });
  if (rollLimited(ipHash(clientIp(req)), 1)) return json(res, 429, { error: 'slow down' });
  let body = '', killed = false;
  req.on('data', c => {
    body += c;
    if (body.length > MAX_BODY) { killed = true; res.writeHead(413); res.end(); req.destroy(); }
  });
  req.on('end', () => {
    if (killed) return;
    let l, sig;
    try { const j = JSON.parse(body); l = String(j.l || ''); sig = String(j.sig || ''); }
    catch (_) { return json(res, 400, { error: 'bad json' }); }
    if (l.length > 64 || !sigOK(l, sig)) return json(res, 400, { error: 'bad life' });
    const code = newCode();
    shares.set(code, l);
    fs.appendFile(SHARES_FILE, JSON.stringify({ c: code, l }) + '\n', () => {});
    json(res, 200, { code });
  });
  req.on('error', () => {});
}

/* GET /api/shared?s=code -> {l, sig}  (없으면 404)
   sig를 다시 붙여 주는 건, 받는 쪽 코드가 기존 검증 경로를 그대로 타게 하기 위해서다. */
function handleShared(req, res, q) {
  const code = String(q.get('s') || '');
  const l = shares.get(code);
  if (!l) return json(res, 404, { error: 'not found' });
  json(res, 200, { l, sig: SECRET ? sign(l) : '' });
}

/* ===== 결과별 OG (오늘의 운세 공유 카드) ===== */
const isCode = c => /^[A-Za-z0-9]{7}$/.test(c);
/* HTML 속성값 이스케이프. 랜딩의 og 제목·설명은 클라이언트가 보낸 문자열이라 그대로 박으면
   메타 태그를 깨거나 스크립트를 심을 수 있다. 속성 경계(" < > &)만 막으면 충분하다. */
function esc(s) {
  return String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

/* 파일 수가 상한을 넘으면 오래된 것부터 지운다. 쓰기마다 하면 무거우니 드문드문(2%)만 돈다 —
   운세는 날짜가 지나면 가치가 없어 오래된 것부터 버려도 잃을 게 없다. */
function pruneOg() {
  if (Math.random() > 0.02) return;
  fs.readdir(OG_DIR, (e, files) => {
    if (e || !files) return;
    const imgs = files.filter(f => /\.(png|jpg)$/.test(f));
    if (imgs.length <= MAX_OG_FILES) return;
    const stats = [];
    let pending = imgs.length;
    imgs.forEach(f => fs.stat(path.join(OG_DIR, f), (er, st) => {
      if (!er) stats.push({ f, m: st.mtimeMs });
      if (--pending === 0) {
        stats.sort((a, b) => a.m - b.m);
        stats.slice(0, stats.length - MAX_OG_FILES).forEach(s => fs.unlink(path.join(OG_DIR, s.f), () => {}));
      }
    }));
  });
}

/* POST /api/fortune-share  body {l, sig, og, t, d} -> {code}
   결과 카드 공유(/api/share)와 같되, 운세 카드 이미지(og: data URL)와 랜딩 메타(t/d)를 함께 받는다.
   서명이 유효한 생만 저장한다(그래서 코드로 꺼낸 생은 재검증이 필요 없다). 본문에 이미지가 실려
   /api/share보다 크므로 별도 상한을 쓴다. */
function handleFortuneShare(req, res) {
  if (!SECRET) return json(res, 503, { error: 'unavailable' });
  if (rollLimited(ipHash(clientIp(req)), 3)) return json(res, 429, { error: 'slow down' });
  let body = '', killed = false;
  req.on('data', c => {
    body += c;
    if (body.length > MAX_OG_BODY) { killed = true; res.writeHead(413); res.end(); req.destroy(); }
  });
  req.on('end', () => {
    if (killed) return;
    let j; try { j = JSON.parse(body); } catch (_) { return json(res, 400, { error: 'bad json' }); }
    const l = String(j.l || ''), sig = String(j.sig || '');
    if (l.length > 64 || !sigOK(l, sig)) return json(res, 400, { error: 'bad life' });
    /* og 는 data:image/(png|jpeg);base64,… 만 받는다. 디코드해 크기·매직바이트를 확인한다 —
       엉뚱한 바이트가 /api/og로 이미지인 척 나가지 않게. 없거나 이상하면 이미지 없이 코드만 발급한다. */
    let buf = null, ext = '';
    const m = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(String(j.og || ''));
    if (m) {
      ext = m[1] === 'jpeg' ? 'jpg' : 'png';
      try { buf = Buffer.from(m[2], 'base64'); } catch (_) { buf = null; }
      if (buf) {
        const magic = ext === 'png' ? (buf[0] === 0x89 && buf[1] === 0x50) : (buf[0] === 0xFF && buf[1] === 0xD8);
        if (buf.length > MAX_OG_BYTES || buf.length < 100 || !magic) { buf = null; ext = ''; }
      }
    }
    const title = String(j.t || '').slice(0, 120);
    const desc = String(j.d || '').slice(0, 200);
    const code = newCode();
    shares.set(code, l);
    if (title || desc || ext) ogMeta.set(code, { t: title, d: desc, x: ext });
    fs.appendFile(SHARES_FILE, JSON.stringify({ c: code, l, t: title, d: desc, x: ext }) + '\n', () => {});
    if (buf) fs.mkdir(OG_DIR, { recursive: true }, () => {
      fs.writeFile(path.join(OG_DIR, code + '.' + ext), buf, () => pruneOg());
    });
    json(res, 200, { code });
  });
  req.on('error', () => {});
}

/* GET /api/og?s=code -> 저장된 카드 이미지. 없으면 일반 og-image.png로 302(미리보기가 깨지지 않게). */
function ogFallback(res) { res.writeHead(302, { location: 'https://' + CANON_HOST + '/og-image.png' }); res.end(); }
function handleOg(req, res, q) {
  const code = String(q.get('s') || '');
  if (!isCode(code)) return ogFallback(res);
  const meta = ogMeta.get(code);
  const exts = meta && meta.x ? [meta.x] : ['jpg', 'png'];
  (function next(i) {
    if (i >= exts.length) return ogFallback(res);
    fs.readFile(path.join(OG_DIR, code + '.' + exts[i]), (e, buf) => {
      if (e) return next(i + 1);
      res.writeHead(200, {
        'content-type': exts[i] === 'jpg' ? 'image/jpeg' : 'image/png',
        'content-length': buf.length,
        'cache-control': 'public, max-age=31536000, immutable',   /* 코드별 내용은 고정이라 영구 캐시 */
      });
      res.end(buf);
    });
  })(0);
}

/* GET /s/<code> — 크롤러용 미끼 랜딩. 결과별 og만 박고, 사람은 JS로 /?s=code 앱으로 넘긴다
   (크롤러는 JS를 실행하지 않아 og만 읽고 멈춘다 — en.html 같은 언어 랜딩과 같은 수법).
   ref·v·via는 앱으로 그대로 넘겨 채널 각인을 잇는다(화이트리스트만, 임의 파라미터 주입 차단). */
function handleShareLanding(req, res, code, q) {
  if (!isCode(code) || !shares.has(code)) {
    res.writeHead(302, { location: 'https://' + CANON_HOST + '/' }); return res.end();
  }
  const meta = ogMeta.get(code) || {};
  const title = meta.t || '🥠 오늘의 환생 운세';
  const desc = meta.d || '네 운세는? 카드를 열어 확인해 보세요.';
  const img = 'https://' + CANON_HOST + '/api/og?s=' + code;
  const landing = 'https://' + CANON_HOST + '/s/' + code;
  let extra = '';
  for (const k of ['ref', 'v', 'via']) {
    const val = String(q.get(k) || '');
    if (/^[A-Za-z0-9_-]{1,32}$/.test(val)) extra += '&' + k + '=' + val;
  }
  const app = '/?s=' + code + extra;
  const html = `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="환생 시뮬레이터">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${esc(img)}">
<meta property="og:image:width" content="1080">
<meta property="og:image:height" content="1350">
<meta property="og:url" content="${esc(landing)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<meta name="twitter:image" content="${esc(img)}">
<link rel="canonical" href="https://${CANON_HOST}/">
<script>location.replace(${JSON.stringify(app)});</script>
<style>html,body{margin:0;height:100%;background:#0a0d1c;color:#ece9f5;font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
.wrap{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;text-align:center;padding:24px}
a.enter{color:#0a0d1c;background:#f3c95c;text-decoration:none;font-weight:700;padding:12px 26px;border-radius:999px}
p{color:#9a98b5;margin:0}</style>
</head>
<body><div class="wrap"><p>${esc(title)}</p><a class="enter" href="${esc(app)}">확인하러 가기 &rarr;</a></div></body>
</html>`;
  const b = Buffer.from(html);
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-length': b.length, 'cache-control': 'public, max-age=300' });
  res.end(b);
}

/* ===== 이벤트 append =====
   한 줄 = 이벤트 하나(JSONL). 쓰기는 fire-and-forget이라 클라이언트를 절대 기다리게 하지
   않는다. 클라이언트는 응답을 보지 않으므로(sendBeacon) 실패해도 조용히 버린다. */
function handleTrack(req, res) {
  const ip = clientIp(req);
  let body = '';
  let killed = false;
  req.on('data', c => {
    body += c;
    if (body.length > MAX_BODY) { killed = true; res.writeHead(413); res.end(); req.destroy(); }
  });
  req.on('end', () => {
    if (killed) return;
    res.writeHead(204); res.end();   /* 파싱보다 응답이 먼저 — 클라 대기 0 */
    try {
      const parsed = JSON.parse(body);
      const events = (Array.isArray(parsed) ? parsed : [parsed]).slice(0, MAX_BATCH);
      if (!events.length) return;
      const h = ipHash(ip);
      if (rateLimited(h, events.length)) return;
      const now = Date.now();
      const lines = events.map(ev => JSON.stringify({
        t: now,                                     /* 서버 수신 시각 (클라 시계 불신) */
        e: String(ev && ev.e || '').slice(0, 32),
        p: (ev && ev.p && typeof ev.p === 'object') ? ev.p : {},
        ip_h: h,
      })).join('\n') + '\n';
      fs.appendFile(EVENTS_FILE, lines, () => {});
    } catch (_) { /* 잘못된 요청은 조용히 버린다 */ }
  });
  req.on('error', () => {});
}

function json(res, code, obj) {
  const body = Buffer.from(JSON.stringify(obj));
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': body.length,
    'cache-control': 'no-store',
  });
  res.end(body);
}

http.createServer((req, res) => {
  const u = new URL(req.url || '/', 'http://x');
  const url = u.pathname.replace(/\/+$/, '') || '/';
  if (req.method === 'GET' && url === '/api/counter') return json(res, 200, { total });
  if (req.method === 'POST' && url === '/api/counter/inc') {
    total++;
    dirty = true;
    return json(res, 200, { total });
  }
  if (req.method === 'POST' && url === '/api/track') return handleTrack(req, res);
  if (req.method === 'POST' && url === '/api/share') return handleShare(req, res);
  if (req.method === 'POST' && url === '/api/fortune-share') return handleFortuneShare(req, res);
  if (req.method === 'GET' && url === '/api/og') return handleOg(req, res, u.searchParams);
  if (req.method === 'GET' && url === '/api/shared') return handleShared(req, res, u.searchParams);
  /* 결과별 OG 미끼 랜딩: /s/<code>. (nginx가 이 경로를 이 프로세스로 프록시해야 산다 — DEPLOY.md 참고) */
  if (req.method === 'GET' && url.startsWith('/s/')) return handleShareLanding(req, res, url.slice(3), u.searchParams);
  if (req.method === 'GET' && url === '/api/roll') return handleRoll(req, res, u.searchParams);
  if (req.method === 'GET' && url === '/api/fortune') return handleFortune(req, res, u.searchParams);
  if (req.method === 'GET' && url === '/api/verify') return handleVerify(req, res, u.searchParams);
  /* 도메인 통합 폴백용 헬스 체크. 옛 도메인(madcamp)이 정본(life-reroll.com)이 살아있는지
     교차출처로 확인하고, 200이면 리다이렉트 · 아니면 옛 도메인이 그대로 서빙한다.
     CF 터널이 죽으면 Cloudflare가 502를 주는데 그 응답엔 이 ACAO 헤더가 없어서 브라우저 CORS가
     막고 → 옛 도메인은 "정본 죽음"으로 보고 폴백한다. 정본 오리진이 살아야만 이 헤더가 붙는다. */
  if (req.method === 'GET' && url === '/api/up') {
    const body = Buffer.from('{"ok":true}');
    res.writeHead(200, { 'content-type': 'application/json', 'content-length': body.length,
      'cache-control': 'no-store', 'access-control-allow-origin': '*' });
    return res.end(body);
  }
  if (req.method === 'GET' && url === '/api/counter/health')
    return json(res, 200, { ok: true, total, roll: !!APP, signing: !!SECRET });
  json(res, 404, { error: 'not found' });
}).listen(PORT, HOST, () => {
  console.log(`[counter] ${HOST}:${PORT} 에서 시작. 현재 값 ${total}, 저장 위치 ${FILE}`);
  console.log(`[counter] 이벤트 기록: ${EVENTS_FILE} (IP당 분당 ${RATE_PER_MIN}개)`);
  console.log(`[counter] 뽑기: ${APP_JS_DIR} (IP당 분당 ${ROLL_RATE_PER_MIN}생)`);
  if (!SECRET) console.warn('[counter] ⚠ LIFE_SECRET 없음 — 위조 방지가 꺼진 상태로 뜬다');
});
