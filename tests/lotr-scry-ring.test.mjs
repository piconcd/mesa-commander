import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../app/index.html', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

function slice(from, to) {
  const begin = html.indexOf(from);
  const end = html.indexOf(to, begin + from.length);
  assert.ok(begin >= 0 && end > begin, `no encuentro ${from}`);
  return html.slice(begin, end);
}

// a tiny fake parser: only the sentences these tests use
const PE_MAP = {
  'put a +1/+1 counter on ~': [{ k: 'selfCounters', n: 1 }],
  'put a +1/+1 counter on target creature': [{ k: 'counterT', n: 1, f: 'creature' }],
  'draw a card': [{ k: 'draw', n: 1 }],
  'scry 3': [{ k: 'scry', n: 3 }],
  'the ring tempts you': [{ k: 'fxTempt' }],
  'create a 1/1 white human soldier creature token': [{ k: 'tokens', n: 1 }],
  'you may pay 2 life. if you do, draw a card': [{ k: 'cdMay', cost: { life: 2 }, ops: [{ k: 'draw', n: 1 }] }],
  'put a +1/+1 counter on each of up to x target creatures': [{ k: 'counterMulti', n: 1, upTo: 'x', f: 'creature' }],
  'exile the top card of your library. you may play that card this turn': [{ k: 'impulse', n: 1 }],
  'exile the top card of your library': [{ k: 'impulse', n: 1 }],
  'choose one and ~ gets +1/+1 until end of turn': [{ k: 'selfPump', p: 1, t: 1 }],
  'target opponent reveals cards from the top of their library until they reveal a land card. put that card onto the battlefield tapped under your control and the rest into their graveyard': [{ k: 'mill', n: 1 }],
  'target opponent reveals cards from the top of their library until they reveal a land card': [],
  'target creature gets +3/+2 until end of turn': [{ k: 'pumpT', p: 3, t: 2, f: 'creature' }],
  'target creature gets +1/+0 and gains first strike until end of turn': [{ k: 'pumpT', p: 1, t: 0, f: 'creature', kw: 'first strike' }],
  'target creature gets +1/+1 until end of turn': [{ k: 'pumpT', p: 1, t: 1, f: 'creature' }],
  'target creature an opponent controls gets -3/-3 until end of turn': [{ k: 'shrinkT', n: 3 }],
  'draw two cards': [{ k: 'draw', n: 2 }],
};
const parseEffects = s => (PE_MAP[s] || []).map(o => Object.assign({}, o));
const cdMask = new Function(slice('function cdMask(s) {', 'function cdSplit(s) {') + '\nreturn cdMask;')();
const cdSplit = new Function('cdMask', slice('function cdSplit(s) {', '// one sentence') + '\nreturn cdSplit;')(cdMask);
const x26Trig = (a, tr) => { (a.fxT ||= []).push(tr); return true; };
const fired = [];
const trigger = (x, ops, extra) => fired.push({ x, ops, extra });
const used = new Set();
const x26TurnOnce = (x, k) => { const key = x.id + k; if (used.has(key)) return false; used.add(key); return true; };
const l7Line = new Function('parseEffects', 'cdSplit', 'x26Trig', 'x26TurnOnce', 'trigger',
  slice('const L7_LOOKED =', '{ const _el = eoeLine; eoeLine = function (a, l, PE) { if (l7Line') + '\nreturn l7Line;')(parseEffects, cdSplit, x26Trig, x26TurnOnce, trigger);
const newA = () => ({ etb: [], ltb: [], allyCombatDmg: [] });

test('«whenever you scry»: once per turn, +1/+1 per card looked at, up to X targets', () => {
  const a = newA();
  assert.ok(l7Line(a, 'whenever you scry, put a +1/+1 counter on ~. this ability triggers only once each turn.'));
  const tr = a.fxT[0]; assert.equal(tr.ev, 'l7scry'); assert.equal(tr.who, 'you');
  fired.length = 0; const x = { id: 1 };
  tr.run(x, { n: 2 }); tr.run(x, { n: 1 });
  assert.equal(fired.length, 1, 'only once each turn');
  assert.deepEqual(fired[0].ops, [{ k: 'selfCounters', n: 1 }]);

  const b = newA();
  assert.ok(l7Line(b, 'whenever you scry, ~ gets +1/+1 until end of turn for each card looked at while scrying this way.'));
  fired.length = 0; b.fxT[0].run({ id: 2 }, { n: 3 });
  assert.deepEqual(fired[0].ops, [{ k: 'selfPump', p: 3, t: 3 }]);

  const c = newA();
  assert.ok(l7Line(c, 'whenever you scry, put a +1/+1 counter on each of up to x target creatures, where x is the number of cards looked at while scrying this way.'));
  fired.length = 0; c.fxT[0].run({ id: 3 }, { n: 2 });
  assert.equal(fired[0].extra.amount, 2);

  const d = newA();
  assert.ok(l7Line(d, "whenever you scry, ~ gets +1/+0 until end of turn and can't be blocked this turn. this ability triggers only once each turn."));
  fired.length = 0; d.fxT[0].run({ id: 4 }, { n: 1 });
  assert.deepEqual(fired[0].ops, [{ k: 'selfPump', p: 1, t: 0 }, { k: 'selfUnblock' }]);
});

test('scry lines that are not fully understood stay unrecognised', () => {
  // a choice («choose one …») or a condition at the start is left to the other parsers
  assert.equal(l7Line(newA(), 'whenever you scry, choose one and ~ gets +1/+1 until end of turn.'), false);
  assert.equal(l7Line(newA(), 'whenever you scry, if you control an island, you may exile ~ from your graveyard. if you do, draw a card.'), false);
  // an X that is not the number of cards looked at
  assert.equal(l7Line(newA(), 'whenever you scry, tap up to x target nonland permanents, where x is the number of cards looked at while scrying this way.'), false);
});

test('the Ring tempts you: «other than ~», choosing a Ring-bearer, graveyard return, deck rule', () => {
  const a = newA();
  assert.ok(l7Line(a, 'whenever the ring tempts you, if you chose a creature other than ~ as your ring-bearer, draw a card.'));
  const tr = a.fxT[0]; assert.equal(tr.ev, 'tempt');
  const me = { id: 10 };
  fired.length = 0;
  tr.run(me, { c: me }); tr.run(me, { c: null }); tr.run(me, { c: { id: 11 } });
  assert.equal(fired.length, 1, 'only when another creature was chosen');

  const b = newA();
  assert.ok(l7Line(b, 'whenever you choose a creature as your ring-bearer, you may pay 2 life. if you do, draw a card.'));
  fired.length = 0; b.fxT[0].run(me, { c: null }); b.fxT[0].run(me, { c: me });
  assert.equal(fired.length, 1); assert.equal(fired[0].ops[0].k, 'cdMay');

  const c = newA();
  assert.ok(l7Line(c, 'when the ring tempts you, return ~ from your graveyard to your hand.'));
  assert.equal(c.l7RingGy, true);
  assert.ok(l7Line(newA(), 'a deck can have up to nine cards named ~.'));
  // an effect with a sentence the parser can't read on its own is not taken
  assert.equal(l7Line(newA(), 'whenever the ring tempts you, target opponent reveals cards from the top of their library until they reveal a land card. put that card onto the battlefield tapped under your control and the rest into their graveyard.'), false);
});

test('combat damage by a creature type, and «enters or leaves the battlefield»', () => {
  const a = newA();
  assert.ok(l7Line(a, 'whenever a goblin or orc you control deals combat damage to a player, exile the top card of your library. you may play that card this turn.'));
  assert.equal(a.allyCombatDmg[0].sub, 'goblin|orc');
  const b = newA();
  assert.ok(l7Line(b, 'whenever an army you control deals combat damage to a player, the ring tempts you.'));
  assert.deepEqual(b.allyCombatDmg[0], { sub: 'army', ops: [{ k: 'fxTempt' }] });
  // «a creature you control» is left to the old parser
  assert.equal(l7Line(newA(), 'whenever a creature you control deals combat damage to a player, draw a card.'), false);
  const c = newA();
  assert.ok(l7Line(c, 'when ~ enters or leaves the battlefield, the ring tempts you.'));
  assert.deepEqual(c.etb, [{ k: 'fxTempt' }]); assert.deepEqual(c.ltb, [{ k: 'fxTempt' }]);
  assert.notEqual(c.etb[0], c.ltb[0]);
});

const kwList = t => (t || '').split(/,\s*|\s+and\s+/).map(z => z.trim()).filter(z => ['trample', 'haste', 'first strike', 'flying'].includes(z));
const l7Sentence = new Function('kwList', slice('function l7Sentence(s, pe) {', '{ const _pe = parseEffects; parseEffects = function (s) { const r = typeof s') + '\nreturn l7Sentence;')(kwList);

test('riders that look at the same target', () => {
  assert.deepEqual(l7Sentence("target creature gets +3/+2 until end of turn. if it's legendary, it also gains trample until end of turn", parseEffects), [
    { k: 'pumpT', p: 3, t: 2, f: 'creature', l7mark: true }, { k: 'l7IfTgt', f: ['legendary'], kws: ['trample'], text: 'legendary' }]);
  assert.deepEqual(l7Sentence("target creature gets +1/+0 and gains first strike until end of turn. if it's a goblin or orc, it also gains haste until end of turn", parseEffects)[1],
    { k: 'l7IfTgt', f: ['goblin', 'orc'], kws: ['haste'], text: 'a goblin or orc' });
  assert.deepEqual(l7Sentence('target creature gets +1/+1 until end of turn. then if that creature has power 4 or greater, it gains first strike until end of turn', parseEffects)[1],
    { k: 'l7IfTgt', powMin: 4, kws: ['first strike'], text: 'fuerza 4 o más' });
  assert.deepEqual(l7Sentence('target creature an opponent controls gets -3/-3 until end of turn. if that creature is legendary, its controller loses 3 life', parseEffects),
    [{ k: 'shrinkT', n: 3, l7mark: true }, { k: 'l7IfTgt', f: ['legendary'], lose: 3, text: 'legendary' }]);
  // the first sentence must be a single targeted pump; an unknown keyword is not dropped
  assert.equal(l7Sentence("draw two cards. if it's legendary, it also gains trample until end of turn", parseEffects), null);
  assert.equal(l7Sentence("target creature gets +3/+2 until end of turn. if it's legendary, it also gains shadow until end of turn", parseEffects), null);
  assert.deepEqual(l7Sentence("if you don't control a ring-bearer, the ring tempts you", parseEffects), [{ k: 'l7TemptNoRB' }]);
  assert.deepEqual(l7Sentence('put a +1/+1 counter on each wraith you control', parseEffects), [{ k: 'x26CtrEach', n: 1, f: 'wraith' }]);
  assert.equal(l7Sentence('put a +1/+1 counter on each creature you control', parseEffects), null);
});

test('rider check and scry event wiring', () => {
  const isType = (c, t) => c.types.includes(t);
  const fxIs = (c, ts) => ts.some(t => isType(c, t));
  const fxLegendary = c => c.types.includes('legendary');
  const P = c => c.p;
  const l7TgtOk = new Function('fxIs', 'fxLegendary', 'P', slice('function l7TgtOk(op, c) {', 'function l7UntapSelf(c)') + '\nreturn l7TgtOk;')(fxIs, fxLegendary, P);
  const orc = { zone: 'bf', types: ['orc'], p: 2 }, leg = { zone: 'bf', types: ['legendary', 'human'], p: 5 };
  assert.equal(l7TgtOk({ f: ['goblin', 'orc'] }, orc), true);
  assert.equal(l7TgtOk({ f: ['legendary'] }, orc), false);
  assert.equal(l7TgtOk({ f: ['legendary'] }, leg), true);
  assert.equal(l7TgtOk({ powMin: 4 }, orc), false);
  assert.equal(l7TgtOk({ powMin: 4 }, leg), true);
  assert.equal(l7TgtOk({ f: ['legendary'] }, null), false);
  // surveil is not scry; scry N looks at no more cards than the library has; scry 0 is no scry (CR 701.22c)
  assert.match(html, /if \(!surveil\) l7ScryEv\(s, Math\.min\(n, L\)\);/);
  assert.match(html, /function l7ScryEv\(s, n\) \{ if \(G && G\.p\[s\] && n > 0\) fxEv\('l7scry'/);
  // Ringwraiths: the graveyard card returns when the Ring tempts its owner
  assert.match(html, /abOf\(D\(g\)\)\.l7RingGy\) trigger\(g, \[\{ k: 'x26ReturnSelfGy', to: 'hand' \}\]\)/);
});
