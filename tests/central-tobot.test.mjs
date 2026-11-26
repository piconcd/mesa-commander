import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const central = readFileSync(new URL('../server/central.js', import.meta.url), 'utf8');

// Builds centralSeatToBot() from server/central.js with a fake table:
// seat 0 is the player asking, seat 2 is a disconnected friend by default.
function toBotFixture({ by = 0, byOnline = true, inGame = true, over = false, tournament = null,
  target = { kind: 'friend', online: false, pid: 'p2' }, player = { isBot: false, dead: false } } = {}) {
  const begin = central.indexOf('function centralSeatToBot(link, target)');
  const end = central.indexOf('window.__centralSeatToBot = centralSeatToBot;', begin);
  assert.ok(begin >= 0 && end > begin);
  const lobby = [{ kind: 'friend', online: byOnline, pid: 'p0' }, { kind: 'friend', online: true, pid: 'p1' }, target, { kind: 'bot' }];
  const NET = { inGame, lobby, peerOf: () => (by === 'none' ? undefined : by) };
  const G = { over, p: [{ isBot: false }, { isBot: false }, player, { isBot: true }] };
  const converted = [];
  const fn = new Function('NET', 'G', 'TOUR', 'SEAT_IDS', 'netToBot',
    central.slice(begin, end) + '\nreturn centralSeatToBot;');
  const toBot = fn(NET, G, tournament, [0, 1, 2, 3], k => converted.push(k));
  return { toBot, converted, link: { closed: false } };
}

test('a connected player can hand a disconnected friend to a bot', () => {
  for (const by of [0, 1]) {
    const f = toBotFixture({ by });
    assert.deepEqual(f.toBot(f.link, 2), { ok: true });
    assert.deepEqual(f.converted, [2]);
  }
});

test('the request is refused when it is not safe or not needed', () => {
  const refused = [
    [toBotFixture({ by: 'none' }), 2],                                      // unknown connection
    [toBotFixture({ byOnline: false }), 2],                                 // requester offline
    [toBotFixture({ inGame: false }), 2],                                   // lobby, no game
    [toBotFixture({ over: true }), 2],                                      // finished game
    [toBotFixture({ tournament: {} }), 2],                                  // draft/tournament
    [toBotFixture(), 0],                                                    // own seat
    [toBotFixture(), 1],                                                    // friend still connected
    [toBotFixture(), 3],                                                    // already a bot
    [toBotFixture(), 7],                                                    // seat out of range
    [toBotFixture(), '2'],                                                  // seat not a number
    [toBotFixture({ player: { isBot: false, dead: true } }), 2],            // already eliminated
  ];
  for (const [f, seat] of refused) {
    const r = f.toBot(f.link, seat);
    assert.equal(r.ok, false);
    assert.equal(typeof r.message, 'string');
    assert.deepEqual(f.converted, []);
  }
  const f = toBotFixture();
  assert.equal(f.toBot({ closed: true }, 2).ok, false);
  assert.equal(f.toBot(null, 2).ok, false);
  assert.deepEqual(f.converted, []);
});

test('the engine routes the message and the client asks for confirmation', () => {
  assert.match(central, /m\.t === 'central-tobot'\) \{\s+const result = centralSeatToBot\(link, m\.seat\);/);
  assert.match(central, /away: !!\(NET\.inGame && st\.pid && !st\.online/);
  assert.match(central, /window\.confirm\(`¿Pasar el asiento de/);
  assert.match(central, /NET\.link\.send\(\{ t: 'central-tobot', seat: s\.k \}\)/);
  assert.match(central, /b\.textContent = `Pasar a bot: \$\{who\}`/);
});
