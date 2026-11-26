import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import crypto from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { chromium } from 'playwright';
import { startRulesCatalog } from './rules-catalog.mjs';

const PORT = Number(process.env.PORT || 3000);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../app');
const CLIENT_JS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'central.js');
const VOICE_JS = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'voice.js');
const CONFIG = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../config/game.json');
const PROFILE = process.env.CHROMIUM_PROFILE || '/data/chromium';
const INVITE_PASSWORD = process.env.INVITE_PASSWORD || '';
if (INVITE_PASSWORD.length < 12) throw new Error('Configure INVITE_PASSWORD with at least 12 characters');
const connections = new Map();
// Voice is an optional, authenticated WebRTC mesh. Node only relays signaling,
// never microphone audio; Chromium's game engine never joins the voice room.
const sessions = new Map(); // connection id -> { seat, name, authenticated }
const voiceRoom = new Map(); // connection id -> { seat, name, muted }
const STUN_URLS = (process.env.STUN_URLS || 'stun:stun.l.google.com:19302').split(',').map(x => x.trim()).filter(Boolean);
const TURN_URLS = (process.env.TURN_URLS || '').split(',').map(x => x.trim()).filter(Boolean);
const TURN_SHARED_SECRET = process.env.TURN_SHARED_SECRET || '';
if (TURN_URLS.length && TURN_SHARED_SECRET.length < 24) throw new Error('TURN_URLS requires TURN_SHARED_SECRET of at least 24 characters');
const gameConfig = JSON.parse(await readFile(CONFIG, 'utf8'));
const VOICE_ENABLED = gameConfig.voiceEnabled !== false;
function sendTo(id, msg) {
  const ws = connections.get(id);
  if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
}
function voiceIceServers(id) {
  const servers = STUN_URLS.length ? [{ urls: STUN_URLS }] : [];
  if (TURN_URLS.length && TURN_SHARED_SECRET) {
    // Coturn REST-style shared-secret credentials, short-lived and per player.
    const username = `${Math.floor(Date.now() / 1000) + 86400}:${id}`;
    const credential = crypto.createHmac('sha1', TURN_SHARED_SECRET).update(username).digest('base64');
    servers.push({ urls: TURN_URLS, username, credential });
  }
  return servers;
}
function broadcastVoice(msg, except = null) {
  for (const id of voiceRoom.keys()) if (id !== except) sendTo(id, msg);
}
function leaveVoice(id) {
  if (!voiceRoom.has(id)) return;
  voiceRoom.delete(id);
  broadcastVoice({ t: 'voice-left', id });
}
function voiceMessage(id, m) {
  const session = sessions.get(id);
  if (!VOICE_ENABLED || !session?.authenticated || !Number.isInteger(session.seat)) return;
  if (m.t === 'voice-join') {
    if (voiceRoom.has(id)) return;
    // One active voice connection per seat. A reconnect evicts an old link.
    for (const [other, member] of voiceRoom) if (member.seat === session.seat) leaveVoice(other);
    const peers = [...voiceRoom].map(([peerId, p]) => ({ id: peerId, seat: p.seat, name: p.name, muted: p.muted }));
    const peer = { id, seat: session.seat, name: session.name, muted: false };
    voiceRoom.set(id, { seat: session.seat, name: session.name, muted: false });
    sendTo(id, { t: 'voice-roster', peers, iceServers: voiceIceServers(id) });
    broadcastVoice({ t: 'voice-joined', peer }, id);
    return;
  }
  if (!voiceRoom.has(id)) return;
  if (m.t === 'voice-leave') leaveVoice(id);
  else if (m.t === 'voice-mute' && typeof m.muted === 'boolean') {
    voiceRoom.get(id).muted = m.muted;
    broadcastVoice({ t: 'voice-muted', id, muted: m.muted }, id);
  } else if (m.t === 'voice-signal') {
    const dst = m.to, data = m.data;
    if (typeof dst !== 'string' || !voiceRoom.has(dst) || !data || typeof data !== 'object' || Array.isArray(data)) return;
    const d = data.description;
    const c = data.candidate;
    if (d && (typeof d.sdp !== 'string' || d.sdp.length > 64000 || !['offer','answer'].includes(d.type))) return;
    if (c && (typeof c.candidate !== 'string' || c.candidate.length > 6000)) return;
    if ((!!d) === (!!c)) return;
    sendTo(dst, { t: 'voice-signal', from: id, data: d ? { description: { type: d.type, sdp: d.sdp } } : { candidate: c } });
  }
}
const rulesCatalog = startRulesCatalog();
let ctx, page;
let ready = false;
let lastState = null;
let starting = false;
let resetting = false;

// Reload only the authoritative page and invalidate all old sessions.
async function resetSharedGame(id) {
  const session = sessions.get(id);
  if (!session?.authenticated || !Number.isInteger(session.seat) || !ready || resetting) return;
  resetting = true;
  ready = false;
  try {
    const result = await page.evaluate(x => window.__centralResetGame(x), id);
    if (!result?.ok) {
      ready = true;
      sendTo(id, { t: 'central-error', message: result?.message || 'No se puede reiniciar la partida.' });
      return;
    }
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__centralReady === true, { timeout: 30000 });
    const why = session.name + ' ha reiniciado la partida del servidor. Volviendo a la sala.';
    for (const [peerId, ws] of connections) {
      sendTo(peerId, { t: 'end', centralReset: true, why });
      ws.close(1000, 'Game reset');
    }
    connections.clear();
    sessions.clear();
    voiceRoom.clear();
    ready = true;
    console.log('Shared game reset by', session.name);
  } catch (e) {
    console.error('Shared game reset failed', e);
    // Avoid serving a half-reset game; Docker can recover the profile.
    process.exit(1);
  } finally {
    resetting = false;
  }
}

async function status() {
  if (!ready || !page || page.isClosed()) return { ready: false, activeGame: false, players: 0 };
  try {
    lastState = await page.evaluate(() => window.__centralState?.() || null);
    return lastState ? { ...lastState, voiceUsers: voiceRoom.size } : { ready: false, activeGame: false, players: 0, voiceUsers: 0 };
  } catch { return { ready: false, activeGame: false, players: 0 }; }
}
async function serve(request, response) {
  let pathname;
  try { pathname = new URL(request.url, `http://127.0.0.1:${PORT}`).pathname; }
  catch { response.writeHead(400).end(); return; }
  if (pathname === '/healthz') {
    const s = await status();
    response.writeHead(s.ready ? 200 : 503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify(s)); return;
  }
  if (pathname === '/config.js') {
    const config = JSON.parse(await readFile(CONFIG, 'utf8'));
    response.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end('window.__COMMANDER_CONFIG=' + JSON.stringify(config).replaceAll('<', '\\u003c') + ';'); return;
  }
  if (pathname === '/voice.js') {
    response.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    response.end(await readFile(VOICE_JS)); return;
  }
  if (pathname === '/central.js') {
    response.writeHead(200, { 'Content-Type': 'text/javascript; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(await readFile(CLIENT_JS)); return;
  }
  if (pathname === '/' || pathname === '/index.html') {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
    response.end(await readFile(path.join(ROOT, 'index.html'))); return;
  }
  response.writeHead(404).end('Not found');
}
const server = http.createServer((req, res) => {
  serve(req, res).catch(e => { console.error('HTTP', e); if (!res.headersSent) res.writeHead(500); res.end('Internal error'); });
});
const wss = new WebSocketServer({ noServer: true, maxPayload: 1024 * 1024 });
server.on('upgrade', (req, socket, head) => {
  if (new URL(req.url, `http://127.0.0.1:${PORT}`).pathname !== '/ws') { socket.destroy(); return; }
  if (!ready) { socket.write('HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\n\r\n'); socket.destroy(); return; }
  wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
});

wss.on('connection', async ws => {
  const id = crypto.randomUUID();
  connections.set(id, ws);
  sessions.set(id, { seat: null, name: 'Jugador', authenticated: false });
  // Register message handlers synchronously: browsers can send "hello"
  // immediately after the socket opens. Queue it until Chromium is ready.
  const connected = page.evaluate(x => window.__centralConnect(x), id)
    .then(ok => { if (!ok) throw new Error('Game engine not ready'); })
    .catch(e => {
      console.error('Connect', e);
      connections.delete(id);
      sessions.delete(id);
      ws.close(1013, 'Game unavailable');
      throw e;
    });
  let queue = connected.catch(() => {});
  let authenticated = false;
  ws.on('message', raw => {
    if (raw.length > 1024 * 1024) { ws.close(1009); return; }
    let m;
    try { m = JSON.parse(raw.toString()); }
    catch { return; }
    if (!m || typeof m !== 'object' || Array.isArray(m)) return;
    if (!authenticated) {
      const proposed = typeof m.invitePassword === 'string' ? m.invitePassword : '';
      const a = Buffer.from(proposed), b = Buffer.from(INVITE_PASSWORD);
      const correct = m.t === 'hello' && a.length === b.length && crypto.timingSafeEqual(a, b);
      if (!correct) {
        ws.send(JSON.stringify({ t: 'reject', why: 'Contraseña de la mesa incorrecta.' }));
        ws.close(1008, 'Unauthorized');
        return;
      }
      authenticated = true;
      sessions.get(id).authenticated = true;
      sessions.get(id).name = String(m.name || 'Jugador').slice(0, 24);
      delete m.invitePassword;
    }
    queue = queue.then(async () => {
      if (!ready || !sessions.has(id)) return;
      if (m.t === 'central-reset') { await resetSharedGame(id); return; }
      if (m.t?.startsWith?.('voice-')) { voiceMessage(id, m); return; }
      if (ready && !page.isClosed()) await page.evaluate(x => window.__centralReceive(x.id, x.m), { id, m });
    }).catch(e => console.error('Incoming event', e));
  });
  ws.on('close', () => {
    leaveVoice(id);
    sessions.delete(id);
    connections.delete(id);
    queue.finally(() => {
      if (ready && !page.isClosed()) return page.evaluate(x => window.__centralDisconnect(x), id);
    }).catch(e => console.error('Disconnect', e));
  });
});

async function launchGame() {
  if (starting) return;
  starting = true;
  try {
    console.log('Starting authoritative Chromium game engine...');
    ctx = await chromium.launchPersistentContext(PROFILE, {
      headless: true,
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
      viewport: { width: 1600, height: 900 },
      serviceWorkers: 'block',
    });
    page = ctx.pages()[0] || await ctx.newPage();
    page.on('console', msg => { if (msg.type() === 'error') console.error('[Browser]', msg.text().slice(0, 1000)); });
    page.on('pageerror', e => console.error('[Page error]', e.message));
    page.on('crash', () => { ready = false; console.error('Chromium crashed'); process.exitCode = 1; setTimeout(() => process.exit(1), 2000); });
    await page.exposeFunction('__engineOutbound', (id, message) => {
      if (message?.t === 'welcome' && Number.isInteger(message.seat)) {
        const s = sessions.get(id);
        if (s) s.seat = message.seat;
      }
      const ws = connections.get(id);
      if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message));
    });
    await page.exposeFunction('__mesaOracleCards', names => rulesCatalog.lookup(names));
    await page.goto(`http://127.0.0.1:${PORT}/?engine=1`, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__centralReady === true, { timeout: 30000 });
    ready = true;
    console.log('Commander engine ready; accepting clients.');
  } catch (e) {
    console.error('Engine failed', e);
    ready = false;
    process.exit(1);
  } finally { starting = false; }
}

server.listen(PORT, '0.0.0.0', launchGame);
process.on('SIGTERM', async () => {
  rulesCatalog.close();
  ready = false;
  for (const ws of connections.values()) ws.close(1001, 'Server restarting');
  await ctx?.close().catch(e => console.error('Profile close', e));
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 12000).unref();
});
