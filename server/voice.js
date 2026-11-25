/* Mesa Commander: voluntary voice channel for authenticated players.
   WebRTC audio mesh (max. 4 peers), signaling via the existing WebSocket.
   The game server does not receive, decode, store or record the audio. */
(() => {
  'use strict';
  if (new URLSearchParams(location.search).get('engine') === '1') return;
  if (window.__COMMANDER_CONFIG?.voiceEnabled === false) return;

  let microphone = null;
  let active = false;
  let joining = false;
  let muted = false;
  let epoch = 0;
  let activeLink = null;
  let iceServers = [{ urls: ['stun:stun.l.google.com:19302'] }];
  let voiceStatus = '';
  const peers = new Map(); // id -> {pc, audio, pendingIce, signalQueue}
  const members = new Map(); // id -> {id, seat, name, muted}

  const style = document.createElement('style');
  style.textContent = `
    .mc-voice-panel { position:fixed;right:16px;bottom:16px;z-index:10020;box-sizing:border-box;
      width:min(355px,calc(100vw - 24px));max-height:70vh;overflow:auto;background:#1d2330;color:#ebe5d5;
      border:1px solid #465068;border-radius:12px;box-shadow:0 15px 42px #000b;padding:14px;display:grid;gap:11px;
      font-family:'Alegreya Sans',system-ui,sans-serif;font-size:14px; }
    .mc-voice-panel[hidden] {display:none!important}
    .mc-voice-head {display:flex;align-items:center;gap:8px;justify-content:space-between}
    .mc-voice-head strong {font-size:17px;color:#efc87a}
    .mc-voice-actions {display:flex;flex-wrap:wrap;gap:8px}
    .mc-voice-members {list-style:none;margin:0;padding:0;display:grid;gap:5px}
    .mc-voice-members li {background:#272f40;border:1px solid #343c50;padding:6px 9px;border-radius:7px;display:flex;justify-content:space-between;gap:12px}
    .mc-voice-status {font-size:12px;color:#b6c0d3;line-height:1.4;min-height:1.2em}
    .mc-voice-status.error {color:#f0a097}
    #mc-voice-button {white-space:nowrap}
    @media (max-width:600px) {.mc-voice-panel {right:12px;bottom:12px}}
  `;
  document.head.appendChild(style);
  const mainButton = document.createElement('button');
  mainButton.id = 'mc-voice-button';
  mainButton.className = 'btn';
  mainButton.type = 'button';
  mainButton.hidden = true;
  mainButton.title = 'Canal de voz opcional con tus amigos';
  mainButton.textContent = '🎙️ Unirse a voz';
  document.querySelector('.topbar')?.appendChild(mainButton);

  const panel = document.createElement('section');
  panel.className = 'mc-voice-panel';
  panel.hidden = true;
  panel.setAttribute('aria-label', 'Canal de voz');
  panel.innerHTML = `
    <div class="mc-voice-head"><strong>🎧 Voz de la mesa</strong><button type="button" class="btn sm" id="mc-voice-close" aria-label="Cerrar panel de voz">✕</button></div>
    <div id="mc-voice-message" class="mc-voice-status" role="status" aria-live="polite"></div>
    <ul id="mc-voice-members" class="mc-voice-members" aria-label="Participantes en voz"></ul>
    <div class="mc-voice-actions">
      <button type="button" class="btn" id="mc-voice-mute" disabled>🔇 Silenciar micrófono</button>
      <button type="button" class="btn" id="mc-voice-play">🔊 Activar sonido</button>
      <button type="button" class="btn bad" id="mc-voice-leave" disabled>Salir del canal</button>
    </div>
    <small style="color:#9aa2b6">Solo se activa al entrar. El navegador pedirá permiso para usar tu micrófono. El audio no se graba en el servidor.</small>`;
  document.body.appendChild(panel);
  const messageEl = panel.querySelector('#mc-voice-message');
  const listEl = panel.querySelector('#mc-voice-members');
  const muteButton = panel.querySelector('#mc-voice-mute');
  const leaveButton = panel.querySelector('#mc-voice-leave');

  function seated() {
    return NET.mode === 'client' && Number.isInteger(NET.seat) && NET.link?.open;
  }
  function send(m) {
    if (!seated()) return false;
    NET.link.send(m);
    return true;
  }
  function message(text, error = false) {
    voiceStatus = String(text);
    messageEl.textContent = voiceStatus;
    messageEl.classList.toggle('error', error);
  }
  function showPanel() { panel.hidden = false; render(); }
  function render() {
    mainButton.hidden = !seated();
    mainButton.textContent = active ? `🎧 Voz (${members.size + 1})` : joining ? '🎙️ Conectando…' : '🎙️ Unirse a voz';
    mainButton.disabled = joining || !seated();
    muteButton.disabled = !active;
    leaveButton.disabled = !active && !joining;
    muteButton.textContent = muted ? '🎙️ Activar micrófono' : '🔇 Silenciar micrófono';
    listEl.replaceChildren();
    if (!active) {
      const li = document.createElement('li');
      li.textContent = joining ? 'Solicitando permiso al micrófono…' : 'No estás conectado al canal de voz.';
      listEl.appendChild(li);
      return;
    }
    const self = document.createElement('li');
    const selfName = document.createElement('span'); selfName.textContent = 'Tú';
    const selfState = document.createElement('span'); selfState.textContent = muted ? '🔇 Silenciado' : '🎙️ Activo';
    self.append(selfName, selfState); listEl.appendChild(self);
    for (const member of [...members.values()].sort((a, b) => a.seat - b.seat)) {
      const li = document.createElement('li');
      const who = document.createElement('span'); who.textContent = member.name || `Asiento ${member.seat + 1}`;
      const status = document.createElement('span');
      const peer = peers.get(member.id);
      status.textContent = member.muted ? '🔇' : (peer?.pc.connectionState === 'connected' ? '🔊' : '⏳');
      status.title = member.muted ? 'Micrófono silenciado' : peer?.pc.connectionState === 'connected' ? 'Audio conectado' : 'Conectando audio';
      li.append(who, status); listEl.appendChild(li);
    }
  }
  function cleanPeer(id) {
    const entry = peers.get(id);
    if (!entry) return;
    peers.delete(id);
    entry.pc.onicecandidate = null;
    entry.pc.ontrack = null;
    entry.pc.onconnectionstatechange = null;
    try { entry.pc.close(); } catch (_) { }
    if (entry.audio) { entry.audio.pause(); entry.audio.srcObject = null; entry.audio.remove(); }
  }
  function stopVoice(notify = true) {
    epoch++;
    if (notify && active && activeLink === NET.link) send({ t: 'voice-leave' });
    activeLink = null;
    active = false;
    joining = false;
    muted = false;
    for (const id of [...peers.keys()]) cleanPeer(id);
    members.clear();
    for (const track of microphone?.getTracks() || []) track.stop();
    microphone = null;
    message('Fuera del canal de voz.');
    render();
  }
  async function enterVoice() {
    if (active || joining || !seated()) return;
    if (!navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection) {
      message('Necesitas un navegador compatible y entrar por HTTPS para usar el micrófono.', true);
      showPanel();
      return;
    }
    joining = true;
    activeLink = NET.link;
    const attempt = ++epoch;
    showPanel();
    message('Solicitando acceso al micrófono…');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
      if (attempt !== epoch || !seated() || activeLink !== NET.link) {
        stream.getTracks().forEach(t => t.stop());
        if (attempt === epoch) stopVoice(false);
        return;
      }
      microphone = stream;
      active = true;
      joining = false;
      if (!send({ t: 'voice-join' })) { stopVoice(false); return; }
      message('Entrando al canal de voz…');
      render();
    } catch (e) {
      if (attempt !== epoch) return;
      joining = false;
      activeLink = null;
      message(e?.name === 'NotAllowedError' ? 'Permiso de micrófono denegado. Actívalo en los ajustes del navegador.' : 'No se pudo activar el micrófono: ' + (e.message || 'revisa el dispositivo'), true);
      render();
    }
  }
  function createPeer(id) {
    if (!active || peers.has(id)) return peers.get(id);
    const pc = new RTCPeerConnection({ iceServers });
    const entry = { pc, audio: null, pendingIce: [], signalQueue: Promise.resolve() };
    peers.set(id, entry);
    for (const track of microphone?.getAudioTracks() || []) pc.addTrack(track, microphone);
    pc.onicecandidate = e => {
      if (e.candidate && active) send({ t: 'voice-signal', to: id, data: { candidate: e.candidate.toJSON() } });
    };
    pc.ontrack = e => {
      if (entry.audio) entry.audio.remove();
      const audio = document.createElement('audio');
      audio.autoplay = true; audio.playsInline = true;
      audio.dataset.voicePeer = id;
      audio.srcObject = e.streams[0] || new MediaStream([e.track]);
      audio.style.display = 'none';
      document.body.appendChild(audio);
      entry.audio = audio;
      audio.play().catch(() => message('Tu navegador ha bloqueado la reproducción. Pulsa «Activar sonido».'));
    };
    pc.onconnectionstatechange = () => {
      render();
      if (pc.connectionState === 'failed') message('No se pudo conectar el audio con uno de los jugadores. Puede necesitarse el servidor TURN.', true);
    };
    return entry;
  }
  async function createOffer(id) {
    const entry = createPeer(id);
    if (!entry || !active) return;
    try {
      await entry.pc.setLocalDescription(await entry.pc.createOffer());
      if (active) send({ t: 'voice-signal', to: id, data: { description: entry.pc.localDescription.toJSON() } });
    } catch (e) { console.warn('[voice] creating offer', e); }
  }
  function handleSignal(id, data) {
    if (!active || !members.has(id)) return;
    const entry = createPeer(id);
    if (!entry) return;
    entry.signalQueue = entry.signalQueue.then(async () => {
      const pc = entry.pc;
      if (!active || pc.signalingState === 'closed') return;
      if (data.description) {
        await pc.setRemoteDescription(data.description);
        for (const candidate of entry.pendingIce.splice(0)) await pc.addIceCandidate(candidate).catch(() => {});
        if (data.description.type === 'offer') {
          await pc.setLocalDescription(await pc.createAnswer());
          if (active) send({ t: 'voice-signal', to: id, data: { description: pc.localDescription.toJSON() } });
        }
      } else if (data.candidate) {
        if (pc.remoteDescription) await pc.addIceCandidate(data.candidate);
        else entry.pendingIce.push(data.candidate);
      }
    }).catch(err => console.warn('[voice] signaling', err));
  }
  window.__voiceOnMessage = m => {
    if (!m || typeof m.t !== 'string' || !m.t.startsWith('voice-')) return false;
    if (!active || activeLink !== NET.link) return true;
    if (m.t === 'voice-roster') {
      iceServers = Array.isArray(m.iceServers) ? m.iceServers : iceServers;
      members.clear();
      for (const peer of m.peers || []) {
        if (typeof peer.id !== 'string') continue;
        members.set(peer.id, peer);
        createOffer(peer.id); // The *new* joiner offers; existing members answer.
      }
      message(members.size ? 'Conectando con los demás jugadores…' : 'En el canal de voz. Esperando a tus amigos…');
    } else if (m.t === 'voice-joined' && m.peer?.id) {
      members.set(m.peer.id, m.peer);
      message('Un jugador se ha unido a la voz.');
    } else if (m.t === 'voice-left' && typeof m.id === 'string') {
      cleanPeer(m.id); members.delete(m.id);
      message('Un jugador ha salido del canal de voz.');
    } else if (m.t === 'voice-muted' && members.has(m.id)) {
      members.get(m.id).muted = !!m.muted;
    } else if (m.t === 'voice-signal' && typeof m.from === 'string' && m.data) {
      handleSignal(m.from, m.data);
    }
    render();
    return true;
  };
  mainButton.addEventListener('click', () => active ? showPanel() : enterVoice());
  panel.querySelector('#mc-voice-close').addEventListener('click', () => { panel.hidden = true; });
  leaveButton.addEventListener('click', () => stopVoice());
  muteButton.addEventListener('click', () => {
    if (!active) return;
    muted = !muted;
    for (const track of microphone?.getAudioTracks() || []) track.enabled = !muted;
    send({ t: 'voice-mute', muted });
    message(muted ? 'Micrófono silenciado.' : 'Micrófono activado.');
    render();
  });
  panel.querySelector('#mc-voice-play').addEventListener('click', () => {
    Promise.allSettled([...peers.values()].map(p => p.audio?.play()).filter(Boolean)).then(results => {
      if (results.some(r => r.status === 'rejected')) message('Permite la reproducción de sonido en tu navegador.', true);
      else message('Reproducción de sonido activada.');
    });
  });
  setInterval(() => {
    if ((active || joining) && (!seated() || activeLink !== NET.link)) { stopVoice(false); message('Conexión con el servidor perdida. Vuelve a entrar al canal de voz.'); }
    render();
  }, 1200);
  window.addEventListener('pagehide', () => stopVoice());
})();
