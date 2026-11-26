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

const NUMW = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7 };
const num = s => NUMW[s];
const block = slice('const CD_SKIP =', '{ const _pe = parseEffects; parseEffects = function (s) { return cdParse(s, _pe); }; }');
const typeMatchDef = new Function('COLORWORD', slice('function wordForms(w) {', '\n') + '\n' + slice('function typeMatchDef(d, phrase, card) {', 'function countSpec(') + '\nreturn typeMatchDef;')({});
const lib = new Function('num', 'typeMatchDef', 'esES', 'esc', `
  let G = { cards: {}, p: [{}] }; const XOPS = {}, XPROMPT = {}, XTEXT = {};
  const calls = [];
  let castSpell = async (s, c, opts) => { calls.push(['cast', c.zone]); c.zone = 'stack'; return true; };
  let resolveSpell = (s, c) => { calls.push(['resolve']); c.zone = 'hand'; moveCard(c, 'bf'); };
  let moveCard = (c, to) => { c.zone = to; };
  const D = c => c.d; const isPermDef = d => /creature/i.test(d.type_line);
  const fullCost = c => ({ generic: c.cost, pips: ['U'] });
  const x26TotalCost = k => k.generic + k.pips.length;
  ${block}
  return { cdParse, cdCond, cdOk, castSpell: (...a) => castSpell(...a), resolveSpell: (...a) => resolveSpell(...a), moveCard: (...a) => moveCard(...a), G: () => G };`)(num, typeMatchDef, x => x, x => x);

// the old parser: it looks for effects anywhere in the text and ignores «if …»
const oldPe = s => {
  const ops = [];
  if (/draw two cards/.test(s)) ops.push({ k: 'draw', n: 2 });
  else if (/draw a card/.test(s)) ops.push({ k: 'draw', n: 1 });
  if ((/deals 2 damage to that creature's controller/).test(s)) ops.push({ k: 'dmgThat', n: 2 });
  else if (/deals 5 damage to target creature/.test(s)) ops.push({ k: 'dmg', n: 5 });
  if (/destroy all nonartifact creatures/.test(s)) ops.push({ k: 'wipe' });
  return ops;
};
const pe = s => lib.cdParse(s, oldPe);

test('«if this spell was kicked / cast from a graveyard / wasn\'t cast from your hand»', () => {
  assert.equal(lib.cdCond('this spell was kicked').k, 'kicked');
  assert.equal(lib.cdCond('this spell was cast using teamwork').k, 'kicked');
  assert.equal(lib.cdCond("this spell's additional cost was paid").k, 'kicked');
  assert.equal(lib.cdCond('this spell was cast from a graveyard').k, 'fromGy');
  assert.equal(lib.cdCond("this spell wasn't cast from your hand").k, 'notHand');
  assert.equal(lib.cdCond('this spell was cast from anywhere other than your hand').k, 'notHand');
  assert.equal(lib.cdCond('you cast it').k, 'castEnt');
  assert.equal(lib.cdCond('he was cast').k, 'castEnt');
  assert.equal(lib.cdCond('five or more mana was spent to cast that spell').n, 5);
  assert.equal(lib.cdCond('{w}{w} was spent to cast it'), null); // colour of the mana: not recorded yet
  // «draw a card. if …, draw two cards instead»: read sentence by sentence
  const ops = pe('draw a card. if this spell was cast from a graveyard, draw two cards instead.');
  assert.deepEqual(ops.map(o => [o.n, o.cnd.not ? 'no' : 'si']), [[1, 'no'], [2, 'si']]);
  const src = { castFromGy: true };
  assert.equal(lib.cdOk(ops[0].cnd, { seat: 0, src }), false);
  assert.equal(lib.cdOk(ops[1].cnd, { seat: 0, src }), true);
  assert.equal(lib.cdOk(lib.cdCond('this spell was kicked'), { seat: 0, kicked: true }), true);
  assert.equal(lib.cdOk(lib.cdCond('this spell was kicked'), { seat: 0 }), false);
  assert.equal(lib.cdOk(lib.cdCond('five or more mana was spent to cast that spell'), { seat: 0, spent: 5 }), true);
  assert.equal(lib.cdOk(lib.cdCond('five or more mana was spent to cast that spell'), { seat: 0, spent: 4 }), false);
  assert.equal(lib.cdOk(lib.cdCond('five or more mana was spent to cast that spell'), { seat: 0 }), false);
});

test('an effect the old parser dropped keeps the whole text unrecognised', () => {
  // the old parser keeps only the 2 damage: Repulsor Blast must not become «2 damage if teamwork»
  assert.deepEqual(pe("~ deals 5 damage to target creature. if this spell was cast using teamwork, it also deals 2 damage to that creature's controller."), []);
});

test('the zone it was cast from, the mana spent and «if you cast it» are remembered', async () => {
  const G = lib.G(); G.cards[7] = null;
  const c = { id: 7, zone: 'gy', cost: 3, xVal: 2, d: { type_line: 'Creature — Elemental' } };
  await lib.castSpell(0, c, {});
  assert.equal(c.cdFrom, 'gy');
  assert.equal(c.cdSpent, 6); // {3}{U} + X=2
  lib.resolveSpell(0, c);
  assert.equal(c.zone, 'bf');
  assert.equal(lib.cdOk(lib.cdCond('you cast it'), { seat: 0, src: c }), true);
  // it leaves and comes back without being cast: no longer «cast»
  c.zone = 'exile'; lib.moveCard(c, 'bf');
  assert.equal(lib.cdOk(lib.cdCond('you cast it'), { seat: 0, src: c }), false);
  const free = { id: 8, zone: 'hand', cost: 5, d: { type_line: 'Sorcery' } };
  await lib.castSpell(0, free, { free: true });
  assert.equal(free.cdSpent, 0);
});

test('opus triggers receive the mana spent on the spell', () => {
  assert.match(html, /if \(x\.ctl === s && isIS && a\.castSelfIS\.length\) trigger\(x, a\.castSelfIS, \{ amount: d\.cmc \|\| 0, spent: c\.cdSpent \}\);/);
});
