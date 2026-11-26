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

// the real payment code (manaUnits + solve) with a fake table: lands make mana, creatures/artifacts don't
function table(perms) {
  const src = slice('function manaUnits(s, excl, cost) {', '// Offer alternate payments');
  const G = { p: [{ pool: [], life: 40 }] };
  const make = new Function('G', 'permsOf', 'isCreature', 'isType', 'manaOf', 'producedColors', 'manaAmt', 'AB', 'hasKw', 'bonusMana', 'isBotSeat',
    src + '\nreturn { manaUnits, solve };');
  return make(G, () => perms, c => !!c.cre, (c, t) => t === 'artifact' && !!c.art, c => (c.land ? {} : null), c => c.cols || [], () => 1, () => ({}), () => false, () => [], () => false);
}
const land = (n, col = 'U') => ({ id: n, name: n, land: true, cols: [col], tapped: false });
const cre = n => ({ id: n, name: n, cre: true, tapped: false });
const art = n => ({ id: n, name: n, art: true, tapped: false });

test('waterbend lets untapped creatures and artifacts pay {1} each', () => {
  const { solve } = table([cre('a'), cre('b'), cre('c'), art('d')]);
  const sol = solve(0, { generic: 4, pips: [], wb: 4 });
  assert.ok(sol);
  assert.deepEqual(sol.cards.map(c => c.name).sort(), ['a', 'b', 'c', 'd']);
  assert.equal(sol.left.length, 0); // tapping for waterbend makes no floating mana
});

test('creatures do not pay normal costs, and only the waterbend part', () => {
  const { solve } = table([cre('a'), cre('b'), cre('c'), cre('e'), cre('f')]);
  assert.equal(solve(0, { generic: 3, pips: [] }), null);
  assert.equal(solve(0, { generic: 4, pips: [], wb: 2 }), null);
  const withLands = table([land('i1'), land('i2'), cre('a'), cre('b'), cre('c')]);
  const sol = withLands.solve(0, { generic: 4, pips: [], wb: 2 });
  assert.ok(sol);
  assert.equal(sol.cards.filter(c => c.cre).length, 2);
  assert.equal(sol.cards.filter(c => c.land).length, 2);
});

test('waterbend never pays coloured mana and skips tapped or excluded permanents', () => {
  const t = { ...cre('t'), tapped: true };
  const self = cre('self');
  const { solve } = table([land('i1'), t, self, cre('a')]);
  assert.equal(solve(0, { generic: 0, pips: [['U'], ['U']], wb: 0 }), null);
  assert.equal(solve(0, { generic: 2, pips: [['U']], wb: 2 }, self), null); // {T} abilities exclude their own source
  assert.ok(solve(0, { generic: 2, pips: [['U']], wb: 2 }));
});

test('waterbend abilities, additional costs and ward are read from the card text', () => {
  const water = slice('function avWaterLine(a, l, PE, inner) {', '{ const _el = eoeLine; eoeLine = function (a, l, PE) { if (avWaterLine');
  const avWaterLine = new Function('parseAct', water + '\nreturn avWaterLine;')((l) => /: draw a card$/.test(l) ? { generic: 6, pips: [], tap: false, ops: [{ k: 'draw', n: 1 }] } : null);
  const mk = () => ({ acts: [], manual: [] });
  let a = mk();
  assert.equal(avWaterLine(a, 'waterbend {6}: draw a card', null, () => false), true);
  assert.equal(a.acts[0].wb, 6); assert.equal(a.acts[0].text, 'waterbend {6}: draw a card');
  a = mk(); assert.equal(avWaterLine(a, 'waterbend {3}: sacrifice ~. if you do, scry 2.', null, () => false), false);
  a = mk(); assert.equal(avWaterLine(a, 'waterbend {5}: enchanted creature\'s owner shuffles it into their library.', null, () => false), false);
  assert.equal(a.acts.length, 0);
  a = mk(); assert.equal(avWaterLine(a, 'as an additional cost to cast this spell, waterbend {5}.', null, () => false), true); assert.equal(a.avWbAdd, 5);
  a = mk(); assert.equal(avWaterLine(a, 'as an additional cost to cast this spell, you may waterbend {4}.', null, () => false), false);
  assert.match(html, /String\(d\.oracle_text \|\| ''\)\.toLowerCase\(\)\.match\(\/\^ward—waterbend \\\{\(\\d\+\)\\\}\/m\); if \(m\) \{ r\.ward = Math\.max\(r\.ward \|\| 0, \+m\[1\]\); r\.avWardWb = true; \}/);
  assert.match(html, /const sol = solve\(s, \{ generic: w, pips: \[\], wb: AB\(t\)\.avWardWb \? w : 0 \}\);/);
  assert.match(html, /actCost = function \(act, s, x\) \{ const r = _acw\(act, s, x\); if \(act && act\.wb && r\) r\.wb = Math\.min\(act\.wb, r\.generic\); return r; \};/);
});
