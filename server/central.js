/* Mesa Commander - adaptation for an authoritative Chromium engine in Docker.
   This reuses the existing game logic and WebRTC client view protocol, but
   replaces transport with a same-origin WebSocket. Experimental integration. */
(() => {
  'use strict';
  const engine = new URLSearchParams(location.search).get('engine') === '1';
  const SEAT_IDS = [0, 1, 2, 3];
  const GAME_CFG = window.__COMMANDER_CONFIG || {};
  const ROOM = /^[A-Z0-9]{4,12}$/.test(GAME_CFG.code || '') ? GAME_CFG.code : 'SERVER';
  const MIN_PLAYERS = Number.isInteger(GAME_CFG.minimumPlayers) && GAME_CFG.minimumPlayers >= 2 && GAME_CFG.minimumPlayers <= 4 ? GAME_CFG.minimumPlayers : 2;

  if (engine) {
    const links = new Map();
    let resettingGame = false;

    // Extend the current engine; these operations are shared by humans and bots.
    function mcOptionalEffect(text) {
      const m=String(text).trim().match(/^you may (draw (a|one|two|three|four|five|\d+) cards?|gain (\d+) life)\.?$/i);
      if(!m) return null;
      const n=m[2]?({a:1,one:1,two:2,three:3,four:4,five:5}[m[2].toLowerCase()]||Number(m[2])):Number(m[3]);
      if(!Number.isSafeInteger(n)||n<1||n>100) return null;
      return {k:'mcOptional',effect:{k:m[2]?'draw':'gain',n}};
    }
    const mcOriginalParseEffects=parseEffects;
    parseEffects=function(text){const op=mcOptionalEffect(text);return op?[op]:mcOriginalParseEffects(text);};
    XTEXT.mcOptional=op=>'Opcional: '+opText(op.effect);
    XPROMPT.mcOptional=async function(op,pr){
      const game=G;
      const yes=__R(ME,G,await askYesNo(pr.title||'Habilidad opcional',opText(op.effect)+' ¿Quieres hacerlo?'));
      if(yes&&G===game&&!game.killed&&!game.over) applyOp(op.effect,pr.ctx,null);
    };
    XOPS.mcOptional=function(op,ctx){
      if(!isBotSeat(ctx.seat)){seatOps(ctx.seat,[op],ctx,'Habilidad opcional');return;}
      if(op.effect.k==='draw'&&G.p[ctx.seat].lib.length<op.effect.n) return;
      if(op.effect.k==='gain'&&oppsOf(ctx.seat).some(o=>permsOf(o).some(x=>AB(x).remedy))) return;
      applyOp(op.effect,ctx,null);
    };
    AB_CACHE.clear();

    // An event that is prohibited must not count as gained life.
    const mcOriginalGainLife=gainLife;
    gainLife=function(s,n){
      if(n>0&&G?.p[s]&&!G.p[s].dead&&G.p[s].lifeLock!==G.turnsTaken){
        const blocker=permsAll().find(x=>AB(x).noGain);
        if(blocker){log(pn(s)+' no puede ganar vidas ('+cn(blocker)+').','bad');return false;}
      }
      return mcOriginalGainLife(s,n);
    };
    function mcCancelOppositeCounters(cards){
      for(const c of cards){
        if(!c?.cnt||c.zone!=='bf') continue;
        const n=Math.min(c.cnt.p1||0,c.cnt.m1||0);
        if(n>0){c.cnt.p1-=n;c.cnt.m1-=n;}
      }
    }
    const mcOriginalSba=sba;
    sba=function(){if(G&&!G.over)mcCancelOppositeCounters(permsAll());return mcOriginalSba();};

    // Shared matches always automate the supported effects.
    const mcOriginalUserOps=userOps;
    userOps=function(ops,ctx,src){
      SET0.assist=true;
      if(PSET[ME]) PSET[ME].assist=true;
      if(ctx&&PSET[ctx.seat]) PSET[ctx.seat].assist=true;
      return mcOriginalUserOps(ops,ctx,src);
    };

    let preparingRules=false;
    function mcDeckSignature(){return JSON.stringify(NET.lobby.map(st=>[st.pid,st.deckId,!!st.online]));}
    function mcAuditDeck(deck){
      const issues=[];
      for(const name of new Set([...deck.cmd,...deck.list.map(x=>x.n)])){
        const d=deck.defs[name];
        if(!d||d.type_line==='Carta sin datos'){issues.push(name+': sin datos');continue;}
        for(const f of [d,d.back,d.adv].filter(Boolean)){
          try{
            const a=auditDef(f), manual=abOf(f).manual||[];
            if(a.issues.length||manual.length) issues.push(f.name+': '+[...a.issues,...manual].join('; '));
          }catch{issues.push(f.name+': auditoría no disponible');}
        }
      }
      return issues;
    }
    async function mcStartWithOracle(link){
      if(preparingRules)return;
      preparingRules=true;
      const signature=mcDeckSignature(), originals=new Map();
      try{
        const seats=NET.gameSeats().map((st,k)=>k>0&&!NET.lobby[k].online?{...st,deck:SEATS[k].deck}:st);
        const decks=seats.map(st=>getDeck(st.deck));
        const names=[...new Set(decks.flatMap(d=>[...d.cmd,...d.list.map(x=>x.n)]))];
        const result=await window.__mesaOracleCards(names);
        if(resettingGame||link.closed||signature!==mcDeckSignature()||(NET.inGame&&!G?.over)){
          link.send({t:'central-error',message:'La sala ha cambiado; vuelve a pulsar Empezar partida.'});return;
        }
        const raw=new Map(result.cards), warnings=[];
        for(const [k,deck] of decks.entries()){
          const id=seats[k].deck,defs={...deck.defs};
          let missing=0;
          for(const n of new Set([...deck.cmd,...deck.list.map(x=>x.n)])){
            const card=raw.get(n);
            if(!card){missing++;continue;}
            const d=fromScry(card),prior=defs[n];
            if(prior?.img)d.img=prior.img;
            if(prior?.imgL)d.imgL=prior.imgL;
            defs[n]=d;
          }
          const fresh={...deck,defs};
          if(!originals.has(id))originals.set(id,{present:Object.hasOwn(NET.decks,id),deck:NET.decks[id]});
          NET.decks[id]=fresh;
          const issues=mcAuditDeck(fresh);
          warnings[k]={missing,issues};
          if(issues.length||missing)console.warn('Rules audit seat',k,'unverified definitions:',missing,'parser warnings:',issues.length);
        }
        SET0.assist=true;
        netStartGame();
        if(!NET.inGame)return;
        const total=warnings.reduce((n,w)=>n+w.issues.length,0);
        if(!result.version)log('Catálogo Oracle local no disponible; se utilizan las definiciones anteriores.','bad');
        if(total)log('Aviso del motor: hay '+total+' avisos de cobertura. La automatización no es completa.','bad');
        for(const [k,w] of warnings.entries()){
          const peer=NET.lobby[k]?.link;
          if(peer&&(w.issues.length||w.missing))peer.send({t:'central-error',message:'Comprobación de tu mazo: '+w.missing+' cartas sin actualización Oracle; '+w.issues.length+' avisos del intérprete. '+w.issues.slice(0,3).join(' | ').slice(0,600)});
        }
        render();
      }catch(e){
        console.warn('Unable to prepare Commander rules:',e?.message||'unknown error');
        link.send({t:'central-error',message:'No se pudo preparar la partida. Inténtalo de nuevo; los mazos se conservan.'});
      }finally{
        for(const [id,old] of originals){if(old.present)NET.decks[id]=old.deck;else delete NET.decks[id];}
        preparingRules=false;
      }
    }

    // The browser inside Docker is the authority; NONE of its four seats is
    // occupied by the server process itself.
    NET.gameSeats = function () {
      return SEAT_IDS.map(k => {
        const st = this.lobby && this.lobby[k];
        if (st && st.kind === 'friend' && st.pid) {
          return { name: st.name || `Jugador ${k + 1}`, deck: st.deckId || SEATS[k].deck, human: true };
        }
        return { name: SEATS[k].name || `Bot ${k + 1}`, deck: SEATS[k].deck, human: false };
      });
    };
    NET.peerOf = function (link) {
      return this.lobby ? SEAT_IDS.find(k => this.lobby[k].link === link) : undefined;
    };
    NET.remoteSeats = function () {
      if (this.mode !== 'host' || !this.inGame) return [];
      if (tourOn()) return SEAT_IDS.filter(k => this.lobby[k]?.kind === 'friend' && (k === 0 || SHADOW[k]) && GOF[k] && GOF[k].p[k] && !GOF[k].p[k].isBot);
      if (!G) return [];
      return SEAT_IDS.filter(k => this.lobby[k]?.kind === 'friend' && G.p[k] && !G.p[k].isBot && (k === 0 || SHADOW[k]));
    };
    netLobbyMsg = function () {
      return { t: 'lobby', code: NET.code, started: NET.inGame, seats: SEAT_IDS.map(k => {
        const st = NET.lobby[k];
        return st.kind === 'friend'
          ? { kind: 'friend', name: st.name || '', deck: st.deckName || '', online: !!st.online, taken: !!st.pid }
          : { kind: 'bot', name: SEATS[k].name || `Bot ${k + 1}`, deck: getDeck(SEATS[k].deck).name };
      }) };
    };
    netBroadcastLobby = function () {
      if (!NET.lobby) return;
      const m = netLobbyMsg();
      for (const st of NET.lobby) if (st.link && st.online) st.link.send(m);
    };
    const tickSeat = netHostTickSeat;
    netHostTickSeat = function (k) {
      if (k === 0) NET.dirty[0] = true; // actual host DOM, not a shadow DOM
      return tickSeat(k);
    };
    const originalStart = netStartGame;
    netStartGame = function () {
      const s0 = NET.lobby[0];
      if (!s0 || !s0.online || !s0.deckId) return;
      originalStart();
      if (!NET.inGame || !G) return;
      if (G.net) {
        G.net.seats[0] = { pid: s0.pid, name: s0.name,
          deck: NET.decks[s0.deckId] ? { id: s0.deckId, name: NET.decks[s0.deckId].name, cmd: NET.decks[s0.deckId].cmd, list: NET.decks[s0.deckId].list } : null };
        saveCheckpoint();
      }
      if (s0.link && s0.online) { s0.link.send({ t: 'start', seat: 0 }); netFullSync(0); }
    };
    // Recover the server-side game from the persistent Chromium profile after a
    // container restart, without re-opening the old public PeerJS room.
    netResumeHost = function (gn) {
      NET.code = ROOM;
      NET.mode = 'host';
      NET.inGame = true;
      NET.lobby = SEAT_IDS.map(k => {
        const sv = gn.seats && gn.seats[k];
        if (!G?.p?.[k] || G.p[k].isBot || !sv) return { kind: 'bot' };
        const dk = sv.deck;
        if (dk) {
          const defs = {};
          [...dk.cmd, ...dk.list.map(x => x.n)].forEach(n => { if (G.defs[n]) defs[n] = G.defs[n]; });
          NET.decks[dk.id] = { ...dk, defs };
        }
        if (k > 0) netBuildShadow(k);
        G.p[k].away = true;
        return { kind: 'friend', pid: sv.pid, name: sv.name, online: false,
          deckId: dk?.id || null, deckName: dk?.name || '' };
      });
      centralTick();
    };
    function centralTick() {
      if (!NET.tick) NET.tick = setInterval(() => asSeat(0, netHostTick), 100);
      if (!NET.pump) NET.pump = setInterval(() => asSeat(0, netPromptPump), 500);
    }
    function initialize() {
      if (!G || NET.mode === 'client') return false;
      if (NET.mode !== 'host') {
        NET.mode = 'host'; NET.code = ROOM; NET.inGame = false;
        NET.lobby = SEAT_IDS.map(() => ({ kind: 'friend' }));
      }
      centralTick();
      window.__centralReady = true;
      return true;
    }
    function hello(link, m) {
      if (m.v !== NET_PROTO) { link.send({ t: 'reject', why: 'El cliente utiliza una versión diferente.' }); return; }
      const name = String(m.name || 'Jugador').slice(0, 24);
      let k = SEAT_IDS.find(i => NET.lobby[i].kind === 'friend' && NET.lobby[i].pid && NET.lobby[i].pid === m.pid);
      if (k === undefined && NET.inGame) {
        const candidates = SEAT_IDS.filter(i => NET.lobby[i].kind === 'friend' && !NET.lobby[i].online && G?.p?.[i] && !G.p[i].isBot);
        k = candidates.find(i => NET.lobby[i].name?.toLowerCase() === name.toLowerCase());
        if (k === undefined && candidates.length === 1) k = candidates[0];
      }
      if (k === undefined && !NET.inGame) k = SEAT_IDS.find(i => NET.lobby[i].kind === 'friend' && !NET.lobby[i].pid);
      if (k === undefined) { link.send({ t: 'reject', why: NET.inGame ? 'La partida ya ha comenzado y no hay un asiento disponible.' : 'La mesa está llena.' }); return; }
      const st = NET.lobby[k];
      if (st.link && st.link !== link) { const old = st.link; st.link = null; old.close(); }
      Object.assign(st, { kind: 'friend', pid: String(m.pid), name, online: true, link });
      PSET[k] = { ...(PSET[k] || {}), ...(m.prefs || {}), assist: true };
      link.send({ t: 'welcome', seat: k, code: ROOM, host: 'Servidor Mesa Commander', started: NET.inGame });
      if (NET.inGame && G?.p?.[k]) {
        G.p[k].away = false; G.p[k].name = name;
        if (k > 0 && !SHADOW[k]) netBuildShadow(k);
        link.send({ t: 'start', seat: k }); netFullSync(k); render();
      }
      netBroadcastLobby();
    }
    // Reset the shared match, not the Docker service or imported decks.
    async function centralResetGame(id) {
      const link = links.get(id);
      const seat = link && NET.peerOf(link);
      if (!link || link.closed || seat == null || !NET.lobby[seat]?.online) {
        return { ok: false, message: 'Solo un jugador conectado puede reiniciar la partida.' };
      }
      if (resettingGame || !NET.inGame || !G || TOUR) {
        return { ok: false, message: 'No hay una partida de Commander que se pueda reiniciar.' };
      }
      const key = 'mpc.save', stampKey = 'mpc.t.' + key;
      let t;
      try {
        // A newer tombstone prevents restoring an obsolete IndexedDB mirror.
        t = Math.max(Date.now(), Number(localStorage.getItem(stampKey)) || 0) + 1;
        localStorage.setItem(stampKey, String(t));
        localStorage.removeItem(key);
      } catch {
        return { ok: false, message: 'No se ha podido eliminar la partida guardada.' };
      }
      resettingGame = true;
      G.killed = true;
      saveCheckpoint = () => {};
      clearInterval(NET.tick);
      clearInterval(NET.pump);
      await idb.set('d:' + key, { t, v: null });
      return { ok: true };
    }
    window.__centralResetGame = centralResetGame;
    window.__centralConnect = id => {
      if (!window.__centralReady || resettingGame) return false;
      const link = { open: true, id, closed: false,
        send(m) { if (!this.closed) window.__engineOutbound(id, m); },
        close() { if (!this.closed) window.__centralDisconnect(id); } };
      links.set(id, link); return true;
    };
    window.__centralReceive = (id, m) => {
      const link = links.get(id);
      if (resettingGame || !link || !m || typeof m !== 'object' || Array.isArray(m)) return;
      if (m.t === 'hello') { hello(link, m); return; }
      const k = NET.peerOf(link);
      if (k === undefined) return;
      if (m.t === 'central-start') {
        if (k !== 0 || (NET.inGame && !G?.over)) return;
        const ready = NET.lobby.filter(st => st.kind === 'friend' && st.online && !!st.deckId);
        if (ready.length >= MIN_PLAYERS) return mcStartWithOracle(link);
        else link.send({ t: 'central-error', message: `Se necesitan al menos ${MIN_PLAYERS} jugadores con mazo.` });
      } else {
        if (m.t === 'prefs') m = { ...m, prefs: { ...(m.prefs || {}), assist: true } };
        netHostMsg(link, m);
      }
    };
    window.__centralDisconnect = id => {
      const link = links.get(id);
      if (!link) return;
      links.delete(id); link.closed = true; link.open = false;
      if (!resettingGame) netHostGone(link);
    };
    window.__centralState = () => ({
      ready: !!window.__centralReady, inGame: !!NET.inGame,
      activeGame: !!NET.inGame && !!G && !G.over,
      players: NET.lobby ? NET.lobby.filter(s => s.online).length : 0,
      gameOver: !!G?.over
    });
    const t = setInterval(() => { if (initialize()) clearInterval(t); }, 150);
    return;
  }

  // Every human opens the same website and connects by WebSocket. No need to
  // expose PeerJS, TURN or ports other than HTTPS.
  netDial = function () {
    const ji = NET.joinInfo; if (!ji) return;
    if (NET.link) { NET.link.onclose = null; NET.link.close(); NET.link = null; }
    if (NET.sig) { NET.sig.close(); NET.sig = null; }
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${proto}//${location.host}/ws`);
    const link = NET.link = {
      open: false, closed: false,
      send(m) { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m)); },
      close() { this.closed = true; this.open = false; ws.close(); },
      onclose: null,
    };
    NET.status = 'Conectando al servidor…'; netChip();
    ws.onopen = () => {
      if (NET.link !== link) return;
      link.open = true; NET.status = 'Conectado'; NET.err = '';
      link.send({ t: 'hello', v: NET_PROTO, pid: myPid, name: ji.name, prefs: netMyPrefs(), invitePassword: sessionStorage.getItem('mpc.invitePassword') || '' });
      netChip(); netRenderOnline();
    };
    ws.onmessage = e => {
      if (NET.link !== link) return;
      try { const m = JSON.parse(e.data); if (window.__voiceOnMessage?.(m)) return; netClientMsg(m); } catch (err) { console.error('central client message', err); }
    };
    ws.onclose = () => {
      if (NET.link !== link) return;
      link.open = false;
      netClientLost();
    };
    ws.onerror = () => { NET.err = 'No se puede conectar con el servidor de juego.'; netRenderOnline(); };
  };
  const oldClientMsg = netClientMsg;
  netClientMsg = function (m) {
    if (m.t === 'central-error') { toast(esc(m.message || 'No se puede realizar la acción.'), true); return; }
    if (m.t === 'end' && m.centralReset === true && NET.joinInfo) {
      // The new lobby is ready. Use the normal reconnect path with this deck.
      store.set('mpc.join', { ...NET.joinInfo, active: Date.now() });
      sessionStorage.setItem('mpc.centralResetNotice', m.why || 'Partida reiniciada.');
      clearTimeout(NET.retry);
      const link = NET.link;
      NET.link = null;
      link?.close();
      location.reload();
      return;
    }
    oldClientMsg(m);
    if (m.t === 'welcome' && !m.started) {
      const notice = sessionStorage.getItem('mpc.centralResetNotice');
      if (notice) {
        sessionStorage.removeItem('mpc.centralResetNotice');
        NET.auto = false;
        netOpenOnline();
        toast(esc(notice));
      }
    }
    centralRenderStart();
  };
  const oldNetJoin = netJoin;
  netJoin = (code, name, deckId) => oldNetJoin(ROOM, name, deckId);
  function centralRenderStart() {
    const b = document.getElementById('central-start');
    if (!b) return;
    b.hidden = !(NET.mode === 'client' && NET.seat === 0 && (!NET.inGame || NET.meta?.over) && NET.link?.open);
    b.textContent = NET.inGame ? 'Nueva partida' : 'Empezar partida';
    const reset = document.getElementById('central-reset');
    if (reset) reset.hidden = !(NET.mode === 'client' && NET.inGame && !NET.tour && NET.link?.open && Number.isInteger(NET.seat));
  }
  function mount() {
    for (const b of document.querySelectorAll('.topbar [data-act="online"]')) b.hidden = true;
    const bar = document.querySelector('.topbar');
    if (!bar || document.getElementById('central-join')) return;
    const enter = document.createElement('button');
    enter.id = 'central-join'; enter.className = 'btn pri'; enter.textContent = 'Entrar al servidor';
    enter.addEventListener('click', () => {
      if (NET.mode === 'client') { netOpenOnline(); return; }
      const oldName = store.get('mpc.centralName', '');
      const decks = allDecks();
      const cover = document.createElement('div');
      cover.id = 'central-join-overlay';
      cover.style.cssText = 'position:fixed;z-index:10000;inset:0;background:#05070be6;display:grid;place-items:center;padding:20px';
      cover.innerHTML = `<div style="background:#1d2330;max-width:440px;width:100%;border-radius:12px;border:1px solid #465068;padding:20px;display:grid;gap:14px"><h2 style="margin:0;color:#efc87a">Entrar en Mesa Commander</h2><label>Tu nombre<input id="central-name" maxlength="24" type="text"></label><label>Tu mazo<select id="central-deck"></select></label><label>Contraseña de la mesa<input id="central-pass" type="password" autocomplete="off"></label><div style="display:flex;gap:12px"><button class="btn" id="central-cancel">Cancelar</button><button class="btn pri" id="central-connect">Conectar</button></div><small>Importa tus mazos con «Mazos e importar» antes de entrar. El primero en conectarse puede empezar la partida.</small></div>`;
      const name = cover.querySelector('#central-name'); name.value = oldName;
      cover.querySelector('#central-pass').value = sessionStorage.getItem('mpc.invitePassword') || '';
      const deck = cover.querySelector('#central-deck');
      for (const d of decks) { const o = document.createElement('option'); o.value = d.id; o.textContent = d.name; deck.appendChild(o); }
      cover.querySelector('#central-cancel').onclick = () => cover.remove();
      cover.querySelector('#central-connect').onclick = () => {
        const nm = name.value.trim(); if (!nm) return name.focus();
        store.set('mpc.centralName', nm); sessionStorage.setItem('mpc.invitePassword', cover.querySelector('#central-pass').value); cover.remove(); netJoin(ROOM, nm, deck.value);
      };
      document.body.appendChild(cover); name.focus();
    });
    bar.appendChild(enter);
    const start = document.createElement('button'); start.id = 'central-start'; start.className = 'btn pri';
    start.textContent = 'Empezar partida'; start.hidden = true;
    start.onclick = () => NET.link?.send({ t: 'central-start' });
    bar.appendChild(start);
    const reset = document.createElement('button');
    reset.id = 'central-reset'; reset.className = 'btn';
    reset.textContent = 'Reiniciar partida'; reset.hidden = true;
    reset.title = 'Descartar la partida del servidor y volver a la sala todos los jugadores';
    reset.onclick = () => {
      if (!NET.inGame || !NET.link?.open || !Number.isInteger(NET.seat)) return;
      if (window.confirm('¿Reiniciar la partida del servidor para todos? Se perderá el progreso actual y volveréis a la sala. Los mazos se conservarán.')) {
        NET.link.send({ t: 'central-reset' });
      }
    };
    bar.appendChild(reset);
    setInterval(() => { centralRenderStart(); enter.hidden = NET.mode === 'client' && NET.inGame; }, 600);
  }
  mount();
})();
