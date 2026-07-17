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
/* 서명 키. 비어 있으면 서명 기능 전체를 끈다(로컬에서 index.html만 띄우는 경우).
   재시작마다 바뀌면 어제 뿌린 링크가 전부 '위조'로 찍히므로 반드시 고정값을 준다. */
const SECRET = process.env.LIFE_SECRET || '';
/* 클라이언트 소스를 그대로 import한다 — 뽑기 로직이 서버와 브라우저에서 갈라지면
   서명은 통과하는데 확률 분포가 다른, 아무도 못 잡는 버그가 된다. */
const APP_JS_DIR = process.env.APP_JS_DIR || path.join(__dirname, '..', 'js');

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
  const [roll, perma, util] = await Promise.all([
    import(u('roll.js')), import(u('permalink.js')), import(u('util.js')),
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
  if (req.method === 'GET' && url === '/api/roll') return handleRoll(req, res, u.searchParams);
  if (req.method === 'GET' && url === '/api/fortune') return handleFortune(req, res, u.searchParams);
  if (req.method === 'GET' && url === '/api/verify') return handleVerify(req, res, u.searchParams);
  if (req.method === 'GET' && url === '/api/counter/health')
    return json(res, 200, { ok: true, total, roll: !!APP, signing: !!SECRET });
  json(res, 404, { error: 'not found' });
}).listen(PORT, HOST, () => {
  console.log(`[counter] ${HOST}:${PORT} 에서 시작. 현재 값 ${total}, 저장 위치 ${FILE}`);
  console.log(`[counter] 이벤트 기록: ${EVENTS_FILE} (IP당 분당 ${RATE_PER_MIN}개)`);
  console.log(`[counter] 뽑기: ${APP_JS_DIR} (IP당 분당 ${ROLL_RATE_PER_MIN}생)`);
  if (!SECRET) console.warn('[counter] ⚠ LIFE_SECRET 없음 — 위조 방지가 꺼진 상태로 뜬다');
});
