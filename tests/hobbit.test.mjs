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

const PE_MAP = {
  'counter target spell': [{ k: 'counter', f: '', unless: 0 }],
  recruit: [{ k: 'recruitMark' }, { k: 'draw', n: 1 }, { k: 'selfDiscard', n: 1 }, { k: 'recruitTok' }],
  'put a +1/+1 counter on ~': [{ k: 'selfCounters', n: 1 }],
  'put a trample counter on target creature you control': [{ k: 'counterT', n: 1, kind: 'trample', f: 'creature you control' }],
  'it becomes a bear in addition to its other types': [{ k: 'addTypeLast', type: 'Bear' }],
  'if you control three or more bears, draw two cards': [{ k: 'draw', n: 2, cnd: { k: 'ctl', n: 3, f: 'bears' } }],
  'if you control three or more bears, draw two cards. draw a card': [{ k: 'draw', n: 2 }],
  'create a treasure token': [{ k: 'treasure', n: 1, forTgt: false }],
  'create a 6/6 red dragon creature token with flying': [{ k: 'tokens', n: 1, p: 6, t: 6 }],
  'another target creature you control gets +3/+0 and gains first strike until end of turn': [{ k: 'pumpT', p: 3, t: 0, f: 'creature you control', kw: 'first strike' }],
  'another target creature you control and target creature an opponent controls fight': [{ k: 'pumpT', p: 3, t: 0, f: 'creature you control' }],
};
const pe = s => (PE_MAP[s] || []).map(o => Object.assign({}, o));
const needsTarget = o => ['pumpT', 'counterT', 'dmg', 'bounceOwn'].includes(o.k);
const cdMask = new Function(slice('function cdMask(s) {', 'function cdSplit(s) {') + '\nreturn cdMask;')();
const cdSplit = new Function('cdMask', slice('function cdSplit(s) {', '// one sentence') + '\nreturn cdSplit;')(cdMask);
const cdCond = c => (/^you control (\w+) or more treasures$/.test(c) ? { k: 'ctl', n: 4, f: 'treasures', text: c } : null);
const L8 = new Function('needsTarget', 'cdSplit', 'cdCond',
  slice('function l8Other(s, r) {', '{ const _pe = parseEffects; parseEffects = function (s) {\n  if (typeof s') + '\nreturn { l8Other, l8Sentence };')(needsTarget, cdSplit, cdCond);

test('«another target creature you control» never targets the source', () => {
  const s = 'another target creature you control gets +3/+0 and gains first strike until end of turn';
  assert.equal(L8.l8Other(s, pe(s))[0].l8other, true);
  // two targets in the sentence: left alone
  const s2 = 'another target creature you control and target creature an opponent controls fight';
  assert.equal(L8.l8Other(s2, pe(s2))[0].l8other, undefined);
  // the validator and the bot refuse the source
  assert.match(html, /validTarget = function \(op, ctx, x\) \{ if \(op && op\.l8other && ctx && ctx\.src && x && x\.card && x\.card\.id === ctx\.src\.id\) return false;/);
  assert.match(html, /if \(c\.id !== ctx\.src\.id\) return r;\n  return bestBy\(permsOf\(ctx\.seat\)\.filter\(x => x\.id !== ctx\.src\.id/);
});

test('Vow to Erebor, The Black Arrow, Roll-Roll-Roll-Roll', () => {
  assert.deepEqual(L8.l8Sentence("untap target creature you control. it gets +2/+2 until end of turn. if it's a dwarf, you may attach an equipment you control to it", pe), [
    { k: 'pumpT', p: 2, t: 2, f: 'creature you control', l7mark: true }, { k: 'l8UntapLast' }, { k: 'l8AttachEq', f: ['dwarf'] }]);
  assert.deepEqual(L8.l8Sentence('it deals 1 damage to any target. if a dragon is dealt damage this way, destroy it', pe), [
    { k: 'dmg', n: 1, f: 'any target', l7mark: true }, { k: 'l8DestroyHit', f: ['dragon'] }]);
  assert.deepEqual(L8.l8Sentence("exile up to one target creature or land you control. if you do, return it to the battlefield under its owner's control at the beginning of the next end step", pe), [{ k: 'l8Flicker' }]);
  // only when damage was really dealt to that permanent
  assert.match(html, /if \(ctx && op && op\.l7mark\) ctx\.l8hit = d0 != null && \(t\.dmg \|\| 0\) > d0;/);
});

test('Sound the Trumpets and Mirkwood Nurturer: the rest depends on the target', () => {
  const r = L8.l8Sentence("counter target spell. if that spell's mana value was 2 or less, recruit", pe);
  assert.equal(r[0].k, 'counter'); assert.equal(r.length, 5);
  for (const o of r.slice(1)) assert.deepEqual(o.cnd, { k: 'l8tgt', spell: true, mvMax: 2, text: "that spell's mana value was 2 or less" });
  const n = L8.l8Sentence("return up to one other target permanent you control to its owner's hand. if you do, put a +1/+1 counter on ~", pe);
  assert.deepEqual(n, [{ k: 'bounceOwn', l7mark: true }, { k: 'selfCounters', n: 1, cnd: { k: 'l8tgt', gone: true, text: 'you do' } }]);
  // an effect that is not understood keeps the card unrecognised
  assert.equal(L8.l8Sentence("counter target spell. if that spell's mana value was 2 or less, do something odd", pe), null);
});

test('Beorn the Fierce and The Misty Mountains Cold', () => {
  const b = L8.l8Sentence('put a trample counter on up to one target creature you control. it becomes a bear in addition to its other types. then if you control three or more bears, draw two cards', pe);
  assert.deepEqual(b.map(o => o.k), ['counterT', 'addTypeLast', 'draw']); assert.ok(b[2].cnd);
  const m = L8.l8Sentence('create a treasure token. then if you control four or more treasures, sacrifice ~. if you do, create a 6/6 red dragon creature token with flying', pe);
  assert.deepEqual(m.map(o => o.k), ['treasure', 'sacSelf', 'tokens']);
  assert.equal(m[1].cnd.k, 'ctl'); assert.deepEqual(m[2].cnd, { k: 'l8sac', text: 'you do' });
  // the Saga counts as sacrificed only if it was on the battlefield and left it
  assert.match(html, /if \(wasBf && src\.zone !== 'bf' && ctx\) ctx\.l8sacDone = true;/);
});

test('condition checks: draws this turn, the target, the sacrifice, added types', () => {
  const G = { turnsTaken: 5, p: [{ drawT: 5, drawN: 2 }, { drawT: 4, drawN: 9 }], cards: { 7: { zone: 'stack', n: 'a' }, 8: { zone: 'hand', n: 'b' }, 9: { zone: 'bf', n: 'b' } } };
  const D = c => ({ a: { cmc: 2 }, b: { cmc: 5 } })[c.n];
  const cdNum = w => ({ two: 2, three: 3 })[w] || +w;
  const code = slice("{ const _cc = cdCond; cdCond = function (c) { const m = String(c).match(/^you've drawn", '// conditions also see types');
  const f = new Function('cdCond', 'cdOk', 'G', 'D', 'cdNum', code + '\nreturn { cdCond, cdOk };')(() => null, () => 'old', G, D, cdNum);
  const sp = f.cdCond("you've drawn two or more cards this turn");
  assert.deepEqual(sp, { k: 'l8drawn', n: 2, text: "you've drawn two or more cards this turn" });
  assert.equal(f.cdOk(sp, { seat: 0 }), true);
  assert.equal(f.cdOk(sp, { seat: 1 }), false, 'draws from another turn do not count');
  const mv = { k: 'l8tgt', spell: true, mvMax: 2 };
  assert.equal(f.cdOk(mv, { seat: 0, respTo: 7 }), true);
  assert.equal(f.cdOk(Object.assign({}, mv, { mvMax: 1 }), { seat: 0, respTo: 7 }), false);
  assert.equal(f.cdOk({ k: 'l8tgt', gone: true }, { seat: 0, lastTgt: 8 }), true);
  assert.equal(f.cdOk({ k: 'l8tgt', gone: true }, { seat: 0, lastTgt: 9 }), false, 'still on the battlefield');
  assert.equal(f.cdOk({ k: 'l8tgt', gone: true }, { seat: 0 }), false, 'nothing chosen');
  assert.equal(f.cdOk({ k: 'l8sac' }, { seat: 0, l8sacDone: true }), true);
  assert.equal(f.cdOk({ k: 'l8sac' }, { seat: 0 }), false);
  assert.equal(f.cdOk({ k: 'ctl' }, { seat: 0 }), 'old');
  // added types
  const code2 = slice('{ const _ct = cdType; cdType = function (d, phrase, card) {', '// «another target …»');
  const ct = new Function('cdType', code2 + '\nreturn cdType;')((d, ph) => new RegExp(ph.replace(/s$/, '')).test(d.type_line.toLowerCase()));
  assert.equal(ct({ type_line: 'Creature — Wolf' }, 'bears', { addTypes: ['Bear'] }), true);
  assert.equal(ct({ type_line: 'Creature — Wolf' }, 'bears', { addTypes: [] }), false);
});
