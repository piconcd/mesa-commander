import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const central = readFileSync(new URL('../server/central.js', import.meta.url), 'utf8');
const server = readFileSync(new URL('../server/index.mjs', import.meta.url), 'utf8');

function resetFixture({ seat = 0, online = true, inGame = true, tournament = null } = {}) {
  const begin = central.indexOf('async function centralResetGame(id)');
  const end = central.indexOf('window.__centralResetGame = centralResetGame;', begin);
  assert.ok(begin >= 0 && end > begin);
  const link = { closed: false };
  const G = { killed: false };
  const NET = { inGame, lobby: Array.from({ length: 4 }, () => ({ online })), peerOf: () => seat, tick: 1, pump: 2 };
  const values = new Map([['mpc.save', 'old game'], ['mpc.decks', 'keep me']]);
  const mirrored = [];
  const cleared = [];
  const fixture = new Function('links', 'NET', 'G', 'TOUR', 'localStorage', 'idb', 'clearInterval',
    'let resettingGame = false; let saveCheckpoint = () => {};\n' + central.slice(begin, end) + '\nreturn centralResetGame;');
  const reset = fixture(new Map([['player', link]]), NET, G, tournament, {
    getItem: k => values.get(k),
    setItem: (k, v) => values.set(k, v),
    removeItem: k => values.delete(k),
  }, { set: async (k, v) => { mirrored.push([k, v]); return true; } }, k => cleared.push(k));
  return { reset, G, values, mirrored, cleared };
}

test('every connected seat can reset the shared game and invalidate its checkpoint', async () => {
  for (const seat of [0, 1, 2, 3]) {
    const f = resetFixture({ seat });
    assert.deepEqual(await f.reset('player'), { ok: true });
    assert.equal(f.G.killed, true);
    assert.equal(f.values.has('mpc.save'), false);
    assert.equal(f.values.get('mpc.decks'), 'keep me');
    assert.equal(f.mirrored[0][0], 'd:mpc.save');
    assert.equal(f.mirrored[0][1].v, null);
    assert.equal(f.mirrored[0][1].t, Number(f.values.get('mpc.t.mpc.save')));
    assert.deepEqual(f.cleared, [1, 2]);
    assert.equal((await f.reset('player')).ok, false);
  }
});

test('reset is denied for missing or offline seats, lobby and tournament', async () => {
  for (const f of [resetFixture({ seat: null }), resetFixture({ online: false }), resetFixture({ inGame: false }), resetFixture({ tournament: {} })]) {
    assert.equal((await f.reset('player')).ok, false);
    assert.equal(f.G.killed, false);
    assert.equal(f.values.get('mpc.save'), 'old game');
  }
  const f = resetFixture();
  assert.equal((await f.reset('unknown')).ok, false);
  assert.equal(f.mirrored.length, 0);
});

test('reset request uses the authenticated WebSocket queue and reloads the engine', () => {
  assert.match(server, /if \(!session\?\.authenticated \|\| !Number\.isInteger\(session\.seat\)/);
  assert.match(server, /if \(m\.t === 'central-reset'\) \{ await resetSharedGame\(id\); return; \}/);
  assert.match(server, /await page\.reload\(/);
  assert.match(server, /connections\.clear\(\);\s+sessions\.clear\(\);\s+voiceRoom\.clear\(\);/);
  assert.match(central, /window\.confirm\(/);
});
