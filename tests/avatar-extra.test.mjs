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

const NUMW = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4 };
const num = s => (/^\d+$/.test(s) ? +s : NUMW[s] ?? 1);
const avSentence = new Function('num', slice('function avSentence(t, orig) {', '// a text with airbend') + '\nreturn avSentence;')(num);
const KW_LIST = ['flying', 'menace', 'trample', 'haste'];
const avLine = new Function('KW_LIST', slice('function avLine(a, l) {', '{ const _el = eoeLine;') + '\nreturn avLine;')(KW_LIST);

test('Clue tokens and investigate', () => {
  assert.deepEqual(avSentence('create a clue token'), [{ k: 'avClue', n: 1 }]);
  assert.deepEqual(avSentence('you create two clue tokens'), [{ k: 'avClue', n: 2 }]);
  assert.deepEqual(avSentence('investigate'), [{ k: 'avClue', n: 1 }]);
  assert.deepEqual(avSentence('investigate twice'), [{ k: 'avClue', n: 2 }]);
  // a condition in front of the Clue is not dropped: the sentence stays unrecognised
  assert.equal(avSentence('if you attacked this turn, create a clue token'), null);
  const clue = slice('  avClue(op, ctx) {', '  avAllFour(op, ctx) {');
  assert.match(clue, /makeToken\(s, CLUE_T\)/);
});

test('tokens with firebending and firebending granted until end of turn', () => {
  const orig = t => (t === 'create two 2/2 red soldier creature tokens with haste' ? [{ k: 'tokens', n: 2, p: 2, t: 2, name: 'Soldier', colors: ['R'], kws: ['haste'] }] : []);
  assert.deepEqual(avSentence('create two 2/2 red soldier creature tokens with firebending 1', orig), [{ k: 'tokens', n: 2, p: 2, t: 2, name: 'Soldier', colors: ['R'], kws: ['firebending 1'] }]);
  assert.equal(avSentence('create a 2/2 red soldier creature token with firebending 1', () => []), null);
  assert.deepEqual(avSentence('each creature you control gains firebending 5 until end of turn'), [{ k: 'avFireAll', n: 5 }]);
  assert.match(html, /if \(c\.avFireT && c\.avFireT\.turn === G\.turnsTaken\) trigger\(c, \[\{ k: 'avFire', n: c\.avFireT\.n \}\], \{ def: a\.to \}\);/);
});

test('conditional firebending, bend triggers and «tapped unless you control a basic land»', () => {
  let a = { kw: new Set(), attack: [] };
  assert.equal(avLine(a, "~ has firebending 2 as long as there's a lesson card in your graveyard."), true);
  assert.deepEqual(a.attack, [{ k: 'avFire', n: 2, ifLessonGy: true }]);
  a = { kw: new Set(), attack: [] };
  assert.equal(avLine(a, "whenever you waterbend, earthbend, firebend, or airbend, draw a card. then if you've done all four this turn, transform ~."), true);
  assert.deepEqual(a.avBendTrig, [{ k: 'draw', n: 1 }, { k: 'avAllFour' }]);
  a = { kw: new Set(), attack: [] };
  assert.equal(avLine(a, '~ enters tapped unless you control a basic land.'), true);
  assert.deepEqual(a.tapUnless, { basic1: true });
});

test('each kind of bending is remembered per turn and fires «whenever you …bend»', () => {
  const src = slice('function avBend(s, kind) {', '// waterbending happens when');
  const G = { turnsTaken: 7, p: [{}] };
  const aang = { zone: 'bf' }; const other = { zone: 'bf' };
  const fired = []; const post = [];
  const avBend = new Function('G', 'permsOf', 'AB', 'setTimeout0', 'trigger', src + '\nreturn avBend;')(G, () => [aang, other], x => (x === aang ? { avBendTrig: [{ k: 'draw' }] } : {}), f => post.push(f), (x, ops) => fired.push([x, ops[0].k]));
  avBend(0, 'fire'); avBend(0, 'air'); avBend(0, 'fire');
  post.forEach(f => f());
  assert.deepEqual(G.p[0].avBent, { turn: 7, kinds: ['fire', 'air'] });
  assert.equal(fired.length, 3);
  assert.ok(fired.every(([x]) => x === aang));
  G.turnsTaken = 8; avBend(0, 'water');
  assert.deepEqual(G.p[0].avBent, { turn: 8, kinds: ['water'] });
  // paying a waterbend cost is waterbending
  assert.match(html, /solve = function \(s, cost\) \{ const r = _sv\.apply\(this, arguments\); if \(r && cost && cost\.wb > 0\) r\.avWb = true; return r; \};/);
  assert.match(html, /pay = function \(s, sol\) \{ const r = _pw\.apply\(this, arguments\); if \(sol && sol\.avWb\) avBend\(s, 'water'\); return r; \};/);
});

test('Convoke on the card itself turns on convoke for its payment', () => {
  const src = slice('{ const _fcc = fullCost; fullCost = function (c, s) {', '\n');
  let fullCost = () => ({ generic: 3, pips: [] });
  const D = c => c.d;
  fullCost = new Function('fullCost', 'D', src + '\nreturn fullCost;')(fullCost, D);
  assert.equal(fullCost({ d: { oracle_text: 'Convoke (Your creatures can help cast this spell.)\nDraw two cards.' } }).convoke, true);
  assert.equal(fullCost({ d: { oracle_text: 'Creature spells you cast have convoke.' } }).convoke, undefined);
});
