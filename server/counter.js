'use strict';
/*
 * 모두의 환생 횟수 카운터 + 이벤트 수집.
 * 의존성 없는 단일 Node 프로세스. nginx가 /api/ 를 이 포트로 프록시한다.
 *
 *   GET  /api/counter      -> {"total":N}
 *   POST /api/counter/inc  -> {"total":N+1}
 *   POST /api/track        -> 204 (이벤트 1개 또는 배열을 JSONL로 append)
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

const HOST = process.env.COUNTER_HOST || '127.0.0.1';
const PORT = Number(process.env.COUNTER_PORT || 1558);
const FILE = process.env.COUNTER_FILE || '/var/lib/life-reroll/counter.json';
const EVENTS_FILE = process.env.EVENTS_FILE || '/var/lib/life-reroll/events.jsonl';
const MAX_BODY = 8192;      /* suggest 본문(80자) 포함 배치 50개도 충분히 들어간다 */
const MAX_BATCH = 50;
const RATE_PER_MIN = Number(process.env.TRACK_RATE_PER_MIN || 240); /* IP당 분당 이벤트 */

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
function ipHash(ip) {
  const day = new Date().toISOString().slice(0, 10);
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
  const url = (req.url || '').split('?')[0].replace(/\/+$/, '') || '/';
  if (req.method === 'GET' && url === '/api/counter') return json(res, 200, { total });
  if (req.method === 'POST' && url === '/api/counter/inc') {
    total++;
    dirty = true;
    return json(res, 200, { total });
  }
  if (req.method === 'POST' && url === '/api/track') return handleTrack(req, res);
  if (req.method === 'GET' && url === '/api/counter/health') return json(res, 200, { ok: true, total });
  json(res, 404, { error: 'not found' });
}).listen(PORT, HOST, () => {
  console.log(`[counter] ${HOST}:${PORT} 에서 시작. 현재 값 ${total}, 저장 위치 ${FILE}`);
  console.log(`[counter] 이벤트 기록: ${EVENTS_FILE} (IP당 분당 ${RATE_PER_MIN}개)`);
});
