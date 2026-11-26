// Experimental, read-only Nexus probe. Not used by the live game engine.
// Both Java processes must run inside mesa-commander; no public endpoints.
const URL = 'ws://127.0.0.1:8787';
const ACTIONS = new Set(['ping', 'connect', 'getServerInfo', 'getGameTypes',
  'getDeckTypes', 'getPlayerTypes', 'disconnect']);

export async function openNexusProbe({ Socket = globalThis.WebSocket, timeout = 10000 } = {}) {
  const socket = new Socket(URL);
  const pending = new Map();
  let next = 0, ready = false, closed = false;
  let resolveReady, rejectReady;
  const waiting = new Promise((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  const startup = setTimeout(() => stop(new Error('Nexus handshake timeout')), timeout);
  function stop(error) {
    if (closed) return;
    closed = true;
    clearTimeout(startup);
    if (!ready) rejectReady(error);
    for (const p of pending.values()) {
      clearTimeout(p.timer);
      p.reject(error);
    }
    pending.clear();
    try { socket.close(); } catch {}
  }
  socket.addEventListener('close', () => stop(new Error('Nexus connection closed')));
  socket.addEventListener('error', () => stop(new Error('Nexus connection error')));
  socket.addEventListener('message', ({data}) => {
    let frame;
    try { frame = JSON.parse(data); } catch { stop(new Error('Invalid Nexus frame')); return; }
    if (!frame || typeof frame !== 'object') { stop(new Error('Invalid Nexus frame')); return; }
    if (frame.type === 'connected' && !ready && !closed) {
      ready = true;
      clearTimeout(startup);
      resolveReady();
      return;
    }
    // Ignore lobby/game events. Never log private per-account frames.
    if (frame.type !== 'result' || !pending.has(String(frame.requestId))) return;
    const id = String(frame.requestId);
    const p = pending.get(id);
    pending.delete(id);
    clearTimeout(p.timer);
    if (frame.ok === true) p.resolve(frame.data);
    else {
      const code = typeof frame.errorCode === 'string' && /^[A-Z_]+$/.test(frame.errorCode)
        ? frame.errorCode : 'REJECTED';
      p.reject(new Error('Nexus rejected ' + p.action + ': ' + code));
    }
  });
  await waiting;
  function request(action, args = {}) {
    if (!ACTIONS.has(action)) return Promise.reject(new Error('Unsupported probe action'));
    if (closed || !ready) return Promise.reject(new Error('Nexus not connected'));
    if (action === 'connect') {
      // A private, dedicated test account only. Never use a player's account.
      if (typeof args.username !== 'string' || !args.username || typeof args.password !== 'string' || !args.password)
        return Promise.reject(new Error('Dedicated probe credentials required'));
      args = {host:'127.0.0.1', port:17171, username:args.username, password:args.password};
    } else args = {};
    const requestId = String(++next);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => stop(new Error('Nexus request timeout: ' + action)), timeout);
      pending.set(requestId, {resolve, reject, timer, action});
      try { socket.send(JSON.stringify({requestId, action, args})); }
      catch { stop(new Error('Nexus send failed')); }
    });
  }
  return {request, close: () => stop(new Error('Probe closed'))};
}
