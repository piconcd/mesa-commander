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

/* ---------- X sin valor (vida NaN) ---------- */

test('gaining a life amount that is not a number does nothing', () => {
  const src = slice('function gainLife(s, n) {', '\n  G.p[s].life += n;');
  assert.match(src, /if \(!\(n > 0\) \|\| G\.p\[s\]\.dead\) return false;/);
  const guard = src.split('\n')[1];
  const run = new Function('G', 's', 'n', guard + '\nreturn true;');
  const G = { p: [{ life: 40, dead: false }] };
  for (const bad of ['x', undefined, NaN, null, 0, -3]) assert.equal(run(G, 0, bad), false, `con n = ${bad}`);
  assert.equal(run(G, 0, 3), true);
});

test('«gains X life» uses the X of the spell (0 if there is none)', () => {
  const line = html.split('\n').find(l => l.startsWith("    case 'gain':"));
  assert.ok(line);
  assert.match(line, /if \(op\.nAmt \|\| op\.n === 'x'\) op = Object\.assign\(\{\}, op, \{ n: ctx\.amount \|\| 0 \}\);/);
  const fix = new Function('op', 'ctx', "if (op.nAmt || op.n === 'x') op = Object.assign({}, op, { n: ctx.amount || 0 }); return op.n;");
  assert.equal(fix({ k: 'gain', n: 'x', nAmt: true }, {}), 0);
  assert.equal(fix({ k: 'gain', n: 'x', nAmt: true }, { amount: 5 }), 5);
  assert.equal(fix({ k: 'gain', n: 3 }, { amount: 5 }), 3);
});

test('a copy of a spell resolves with a numeric X', () => {
  const src = slice('async function castCopy(s, card) {', 'async function flushPendingCasts()');
  assert.match(src, /const amount = Number\.isFinite\(card\.xVal\) \? card\.xVal : 0;/);
  assert.match(src, /runOpsAI\(ops, \{ seat: s, src: card, amount \}\)/);
  assert.match(src, /userOps\(ops, \{ seat: s, src: card, amount \}, card\)/);
  const amountOf = new Function('card', 'return Number.isFinite(card.xVal) ? card.xVal : 0;');
  assert.equal(amountOf({}), 0);
  assert.equal(amountOf({ xVal: 4 }), 4);
});

/* ---------- transformarse en el sitio ---------- */

function tfEnv() {
  const src = slice('function tfOnBack(c)', 'function trigMult(src)');
  const defs = {
    'Sygg, Wanderwine Wisdom': { name: 'Sygg, Wanderwine Wisdom', back: { name: 'Sygg, Wanderbrine Shield' } },
    'Sygg, Wanderbrine Shield': { name: 'Sygg, Wanderbrine Shield' },
    'Clone': { name: 'Clone' }
  };
  const G = { defs };
  const logs = []; const fired = [];
  const onTf = { 'Sygg, Wanderwine Wisdom': [{ k: 'front' }], 'Sygg, Wanderbrine Shield': [{ k: 'back' }] };
  const D = c => G.defs[c.n];
  const backKey = c => { const b = D(c) && D(c).back; return b ? b.name : null; };
  const make = new Function('G', 'backKey', 'cn', 'recomputeMods', 'log', 'AB', 'trigger', src + '\nreturn { tfOnBack, tfInPlace };');
  const api = make(G, backKey, c => D(c).name, () => {}, m => logs.push(m), c => ({ x26OnTf: onTf[D(c).name] }), (c, ops) => fired.push(ops[0].k));
  return { ...api, logs, fired };
}

test('a double-faced permanent transforms in place and back again', () => {
  const { tfInPlace, tfOnBack, logs, fired } = tfEnv();
  const c = { n: 'Sygg, Wanderwine Wisdom', front: null, zone: 'bf', cnt: { p1: 2 }, tapped: true, dmg: 1 };
  assert.equal(tfOnBack(c), false);
  assert.equal(tfInPlace(c), true);
  assert.equal(c.n, 'Sygg, Wanderbrine Shield');
  assert.equal(tfOnBack(c), true);
  // same object: zone, counters, damage and tapped state stay
  assert.deepEqual([c.zone, c.cnt.p1, c.dmg, c.tapped], ['bf', 2, 1, true]);
  assert.equal(tfInPlace(c), true);
  assert.equal(c.n, 'Sygg, Wanderwine Wisdom');
  assert.equal(c.front, null);
  // each face fires its own «transforms into» trigger
  assert.deepEqual(fired, ['back', 'front']);
  assert.match(logs[0], /se transforma en Sygg, Wanderbrine Shield/);
});

test('only permanents on the battlefield with another face transform', () => {
  const { tfInPlace } = tfEnv();
  assert.equal(tfInPlace({ n: 'Clone', front: null, zone: 'bf' }), false);
  assert.equal(tfInPlace({ n: 'Sygg, Wanderwine Wisdom', front: null, zone: 'hand' }), false);
  // a copy effect (front used for something else) is not a back face
  const copy = { n: 'Sygg, Wanderwine Wisdom', front: 'Clone', zone: 'bf' };
  assert.equal(tfInPlace(copy), false);
  assert.equal(copy.n, 'Sygg, Wanderwine Wisdom');
});

test('«transform ~» and «enters or transforms into» are wired to the new behaviour', () => {
  assert.match(html, /if \(\/\^transform ~\$\/\.test\(t\)\) return \[\{ k: 'transform', inPlace: true \}\];/);
  assert.match(html, /if \(op\.inPlace\) \{ tfInPlace\(c\); break; \}/);
  assert.match(html, /\^whenever ~ enters or transforms into ~, \(\.\+\)\$\/\)\)\) \{ const ops = PE\(m\[1\]\); if \(!ops\.length\) return false; a\.etb\.push\(\.\.\.ops\); a\.x26OnTf = ops; return true; \}/);
});
