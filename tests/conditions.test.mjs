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
const W = {};
const lib = new Function('W', 'num', 'typeMatchDef', 'esES', 'esc', `
  let G = null, permsOf, oppsOf, P, T, D, isLand, isCreature, x26CreIn; const XOPS = {}, XPROMPT = {}, XTEXT = {};
  let castSpell = async () => {}, resolveSpell = () => {}, moveCard = () => {};
  ${block}
  W.set = o => { ({ G, permsOf, oppsOf, P, T, D, isLand, isCreature, x26CreIn } = o); };
  return { cdParse, cdCond, cdOk, cdCost, cdClause };`)(W, num, typeMatchDef, x => x, x => x);

// the old parser: it looks for effects anywhere in the text and ignores «if …»
const oldPe = s => {
  const ops = [];
  if (/create a treasure token/.test(s)) ops.push({ k: 'treasure' });
  if (/surveil 1/.test(s)) ops.push({ k: 'surveil', n: 1 });
  if (/draw (?:a|another) card/.test(s)) ops.push({ k: 'draw', n: 1 });
  if (/draw two cards/.test(s)) ops.push({ k: 'draw', n: 2 });
  if (/you may pay \{3\}\. if you do, draw a card/.test(s)) return [{ k: 'mayPay', generic: 3, ops: [{ k: 'draw', n: 1 }] }];
  return ops;
};
const pe = s => lib.cdParse(s, oldPe);

test('a condition in front of an effect is not lost', () => {
  assert.deepEqual(pe('if you control a wizard, draw a card.'), [{ k: 'draw', n: 1, cnd: { k: 'ctl', n: 1, other: false, f: 'wizard', pow: 0, tou: 0, text: 'you control a wizard' } }]);
  assert.deepEqual(pe('draw a card if you control two or more lands.')[0].cnd.n, 2);
  // a condition the engine can't check: the text stays unrecognised instead of giving a free Treasure
  assert.deepEqual(pe('if you attacked this turn, create a treasure token'), []);
  // «instead»: the sentence before only happens when the condition doesn't hold
  const jett = pe('surveil 1. if her power is 4 or greater, instead draw a card.');
  assert.deepEqual(jett.map(o => o.k), ['surveil', 'draw']);
  assert.equal(jett[0].cnd.not.k, 'srcPow');
  assert.equal(jett[1].cnd.k, 'srcPow');
  // what a later sentence checks happens after the sentence before it
  assert.deepEqual(oldPe('draw a card. then if there\'s a lesson card in your graveyard, create a treasure token').map(o => o.k), ['treasure', 'draw']);
  assert.deepEqual(pe('draw a card. then if there\'s a lesson card in your graveyard, create a treasure token').map(o => o.k), ['draw', 'treasure']);
});

test('conditions the parser already reads, cost reductions and texts without «if» are left alone', () => {
  assert.deepEqual(pe('you may pay {3}. if you do, draw a card.'), [{ k: 'mayPay', generic: 3, ops: [{ k: 'draw', n: 1 }] }]);
  assert.deepEqual(pe('this spell costs {1} less to cast if it targets an attacking creature. draw a card'), [{ k: 'draw', n: 1 }]);
  assert.deepEqual(pe('draw a card'), [{ k: 'draw', n: 1 }]);
  const quoted = 'create a token with "if you control a wizard, draw a card."';
  assert.deepEqual(pe(quoted), oldPe(quoted));
});

test('«you may <cost>. if you do, <effect>» asks for the cost', () => {
  assert.deepEqual(pe('you may sacrifice another creature or artifact. if you do, draw a card.'), [{ k: 'cdMay', cost: { sac: 'creature or artifact', other: true }, ops: [{ k: 'draw', n: 1 }] }]);
  assert.deepEqual(lib.cdCost('you may discard a card'), { discard: 1 });
  assert.deepEqual(lib.cdCost('you may blight 2'), { blight: 2 });
  assert.deepEqual(lib.cdCost('you may sacrifice an artifact or discard a card'), { any: [{ sac: 'artifact' }, { discard: 1 }] });
  assert.equal(lib.cdCost('you may choose a nonland card from it'), null);
  assert.deepEqual(pe('you may choose a nonland card from it. if you do, draw a card'), []);
  assert.deepEqual(pe('if you don\'t, draw a card'), []);
});

test('conditions are checked when the effect happens', () => {
  const cards = [
    { id: 1, ctl: 0, d: { type_line: 'Creature — Human Wizard' }, p: 2, cnt: {} },
    { id: 2, ctl: 0, d: { type_line: 'Basic Land — Island' }, cnt: {} },
    { id: 3, ctl: 1, d: { type_line: 'Basic Land — Swamp' }, cnt: {} },
    { id: 4, ctl: 1, d: { type_line: 'Basic Land — Swamp' }, cnt: {} },
    { id: 9, ctl: 0, d: { type_line: 'Enchantment' }, cnt: { quest: 4 }, zone: 'bf' },
  ];
  const G = { turnsTaken: 7, active: 0, cards: { 9: cards[4] }, defs: { L: { type_line: 'Sorcery — Lesson' } }, p: [{ gy: [], hand: [1, 2], life: 0, gainT: 7, gainedTurn: 3 }, { gy: [] }] };
  G.cards[50] = { n: 'L' };
  W.set({ G, permsOf: s => cards.filter(c => c.ctl === s), oppsOf: s => [1 - s], P: c => c.p || 0, T: c => c.p || 0, D: c => c.d, isLand: c => /land/i.test(c.d.type_line), isCreature: c => /creature/i.test(c.d.type_line), x26CreIn: () => 0 });
  const ok = (text, ctx = { seat: 0, src: { id: 9 } }) => lib.cdOk(lib.cdCond(text), ctx);
  assert.equal(ok('you control a wizard'), true);
  assert.equal(ok('you control another wizard', { seat: 0, src: { id: 1 } }), false);
  assert.equal(ok('you control two or more lands'), false);
  assert.equal(ok('an opponent controls more lands than you'), true);
  assert.equal(ok('it\'s your turn'), true);
  assert.equal(ok('your life total is 0 or less'), true);
  assert.equal(ok('you gained life this turn'), true);
  assert.equal(ok('it has four or more quest counters on it'), true);
  assert.equal(ok('there\'s a lesson card in your graveyard'), false);
  G.p[0].gy.push(50);
  assert.equal(ok('there\'s a lesson card in your graveyard'), true);
  assert.equal(lib.cdOk({ not: lib.cdCond('you control a wizard') }, { seat: 0 }), false);
  assert.equal(lib.cdCond('you attacked this turn'), null);
});

test('the engine checks the condition before each effect, also for human players', () => {
  assert.match(html, /eoeX = function \(op, ctx\) \{ if \(op && op\.cnd\) \{ if \(!cdOk\(op\.cnd, ctx\)\) return \{ k: 'noop' \};/);
  assert.match(html, /if \(op && op\.cnd && typeof cdOk === 'function' && !cdOk\(op\.cnd, pr\.ctx\)\) continue;/);
  assert.match(html, /async cdMay\(op, pr\) \{/);
});
