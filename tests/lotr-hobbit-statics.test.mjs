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

const KW_LIST = ['flying', 'first strike', 'vigilance', 'deathtouch', 'menace', 'trample', 'indestructible', 'hexproof', 'lifelink', 'reach', 'haste'];
const kwList = t => (t || '').split(/,\s*|\s+and\s+/).map(z => z.trim()).filter(z => KW_LIST.includes(z));
const NUMW = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5 };
const num = s => (/^\d+$/.test(s) ? +s : NUMW[s] ?? 1);
const cdNum = num;
const FX_SING = w => (w === 'elves' ? 'elf' : w.replace(/s$/, ''));
const PE_MAP = {
  'amass orcs 2': [{ k: 'amass', n: 2 }],
  'create a 1/1 white halfling creature token': [{ k: 'tokens', n: 1 }],
  'you create a treasure token': [{ k: 'treasure', n: 1 }],
  "~ fights up to one target creature you don't control": [{ k: 'fight' }],
  'you may pay {1}{g}{u}. if you do, return ~ from your graveyard to your hand': [{ k: 'mayPay', generic: 1, ops: [{ k: 'x26ReturnSelfGy', to: 'hand' }] }],
  'draw a card': [{ k: 'draw', n: 1 }],
  'put an indestructible counter on target creature you control': [{ k: 'x26CtrT', list: [['indestructible', 1]], tg: 'myCre' }],
};
const parseEffects = s => (PE_MAP[s] || []).map(o => Object.assign({}, o));
const l7Safe = (eff, ops) => !!ops && ops.length > 0;
const x26Trig = (a, tr) => { (a.fxT ||= []).push(tr); return true; };
const fired = []; const trigger = (x, ops) => fired.push(ops);
const counts = {}; const fxCount = (x, k) => (counts[x.id + k] = (counts[x.id + k] || 0) + 1);
const used = new Set(); const x26TurnOnce = (x, k) => { const key = x.id + k; if (used.has(key)) return false; used.add(key); return true; };
const fxIs = (c, ts) => ts.some(t => c.types.includes(t));
const P = c => c.p;
const l9KwPart = new Function('KW_LIST', slice('function l9KwPart(txt) {', 'function l9GrantOk(g, x, c) {') + '\nreturn l9KwPart;')(KW_LIST);
const l9Line = new Function('parseEffects', 'kwList', 'cdNum', 'FX_SING', 'l9KwPart', 'l7Safe', 'x26Trig', 'trigger', 'fxCount', 'x26TurnOnce', 'fxIs', 'P',
  slice('function l9Line(a, l) {', '{ const _el = eoeLine; eoeLine = function (a, l, PE) { if (l9Line') + '\nreturn l9Line;')(parseEffects, kwList, cdNum, FX_SING, l9KwPart, l7Safe, x26Trig, trigger, fxCount, x26TurnOnce, fxIs, P);

test('equip costs: lines and the cost rules', () => {
  const a = {};
  assert.ok(l9Line(a, 'equip abilities you activate that target ~ cost {2} less to activate.')); assert.equal(a.l9EqLessTgt, 2);
  assert.ok(l9Line(a, 'equip abilities you activate cost {1} less to activate.')); assert.equal(a.l9EqLess, 1);
  const k = {}; assert.ok(l9Line(k, 'as long as you have an enduring story, you may pay {0} rather than pay the equip cost of the first equip ability you activate each turn.')); assert.equal(k.l9EqFree, 'story');
  const f = {}; assert.ok(l9Line(f, 'you may pay {0} rather than pay the equip cost of the first equip ability you activate during each of your turns.')); assert.equal(f.l9EqFree, 'myTurn');
  // the cost: only the generic part goes down, never below 0; the free equip only the first time each turn
  const G = { turnsTaken: 7, active: 1, p: [{}, { l9EqT: null, story: false }] };
  const perms = { 1: [] }; const AB = c => c.ab || {};
  const code = slice('function l9EqFree(s) {', '// bots: equipCost');
  const make = new Function('G', 'permsOf', 'AB', 'fxStory', 'equipCost', code + '\nreturn equipCost;');
  const base = () => ({ generic: 2, pips: [['W']] });
  const ec = make(G, s => perms[s], AB, s => !!G.p[s].story, base);
  const mauler = { zone: 'bf', ab: { l9EqLessTgt: 2 } }, other = { zone: 'bf', ab: {} };
  assert.deepEqual(ec({ id: 1 }, 1, other), { generic: 2, pips: [['W']] });
  assert.deepEqual(ec({ id: 1 }, 1, mauler), { generic: 0, pips: [['W']] });
  perms[1] = [{ ab: { l9EqLess: 1 } }];
  assert.equal(ec({ id: 1 }, 1, other).generic, 1);
  assert.equal(ec({ id: 1 }, 1, mauler).generic, 0, 'never below 0');
  perms[1] = [{ ab: { l9EqFree: 'myTurn' } }];
  assert.deepEqual(ec({ id: 1 }, 1, other), { generic: 0, pips: [] });
  G.p[1].l9EqT = 7; assert.equal(ec({ id: 1 }, 1, other).generic, 2, 'second equip this turn');
  G.p[1].l9EqT = 6; G.active = 2; assert.equal(ec({ id: 1 }, 1, other).generic, 2, 'not your turn');
  perms[1] = [{ ab: { l9EqFree: 'story' } }]; assert.equal(ec({ id: 1 }, 1, other).generic, 2);
  G.p[1].story = true; assert.equal(ec({ id: 1 }, 1, other).generic, 0);
  // the human now chooses the creature first and pays for that creature
  assert.match(html, /const cost = equipCost\(c, ME, t\.card\);/);
});

test('static abilities with a condition', () => {
  const w = {}; assert.ok(l9Line(w, 'as long as you control a goblin or orc, ~ gets +1/+0.'));
  assert.deepEqual(w.selfCond, [{ cond: 'l9ctl:goblin|orc', p: 1, t: 0, kw: [] }]);
  const m = {}; assert.ok(l9Line(m, "~ has first strike as long as it's equipped.")); assert.equal(m.selfCond[0].cond, 'l9equipped');
  const g = {}; assert.ok(l9Line(g, '~ has indestructible as long as two or more creatures died under your control this turn.')); assert.equal(g.selfCond[0].cond, 'l9died:2');
  const t = {}; assert.ok(l9Line(t, 'as long as there are four or more lore counters among sagas you control, ~ has hexproof and indestructible.'));
  assert.deepEqual(t.selfCond[0], { cond: 'l9lore:4', p: 0, t: 0, kw: ['hexproof', 'indestructible'] });
  const x = {}; assert.ok(l9Line(x, 'as long as equipped creature is legendary, it has menace.')); assert.deepEqual(x.l9AttLeg, ['menace']);
  const o = {}; assert.ok(l9Line(o, "~ can't block unless you control a goblin or orc.")); assert.deepEqual(o.l9CantBlkUnless, ['goblin', 'orc']);
  // an unknown keyword is not dropped
  assert.equal(l9Line({}, "~ has shadow as long as it's equipped."), false);
  // the artifact / token forms are left to the older parser
  assert.equal(l9Line({}, 'as long as you control an artifact, ~ gets +1/+1.'), false);
});

test('anthems for legendary creatures, creature tokens, other Spiders (ward) and Treefolk', () => {
  const f = {}; assert.ok(l9Line(f, 'legendary creatures you control get +2/+1 and have ward {1}.'));
  assert.deepEqual(f.l9Grants, [{ other: false, p: 2, t: 1, kws: [], ward: 1, leg: true }]);
  const g = {}; assert.ok(l9Line(g, 'creature tokens you control have deathtouch.')); assert.deepEqual(g.l9Grants[0], { other: false, p: 0, t: 0, kws: ['deathtouch'], ward: 0, token: true });
  const s = {}; assert.ok(l9Line(s, 'other spiders you control have deathtouch and ward {2}.')); assert.deepEqual(s.l9Grants[0], { other: true, p: 0, t: 0, kws: ['deathtouch'], ward: 2, types: ['spider'] });
  const tf = {}; assert.ok(l9Line(tf, 'treefolk you control have vigilance.')); assert.deepEqual(tf.l9Grants[0].types, ['treefolk']);
  // plain anthems stay with the older parser
  assert.equal(l9Line({}, 'other bears you control get +2/+2.'), false);
  assert.equal(l9Line({}, 'nonlegendary creatures you control get +1/+1.'), false);
  const ok = new Function('fxLegendary', 'isCreature', 'fxIs', slice('function l9GrantOk(g, x, c) {', 'const l9Grants =') + '\nreturn l9GrantOk;')(c => c.leg, c => c.cre, fxIs);
  const src = { id: 1, ctl: 0 }; const leg = { id: 2, ctl: 0, zone: 'bf', cre: true, leg: true, types: [] }, tok = { id: 3, ctl: 0, zone: 'bf', cre: true, token: true, types: ['spider'] };
  assert.equal(ok(f.l9Grants[0], src, leg), true); assert.equal(ok(f.l9Grants[0], src, tok), false);
  assert.equal(ok(g.l9Grants[0], src, tok), true); assert.equal(ok(s.l9Grants[0], tok, tok), false, 'other');
  assert.equal(ok(s.l9Grants[0], src, Object.assign({}, tok, { ctl: 1 })), false, 'only yours');
});

test('triggers with a power limit, Uglúk, Gimli, landfall from the graveyard, Boromir', () => {
  const wb = {}; assert.ok(l9Line(wb, 'whenever ~ or another creature you control with power 4 or greater dies, amass orcs 2.'));
  const me = { id: 5, zone: 'bf' }; fired.length = 0;
  wb.fxT[0].run(me, { c: { id: 6, _lastP: 3 } }); wb.fxT[0].run(me, { c: { id: 7, _lastP: 4 } }); wb.fxT[0].run(me, { c: me });
  assert.equal(fired.length, 2); assert.equal(wb.fxT[0].self, true);
  const ug = {}; assert.ok(l9Line(ug, 'whenever another creature you control dies, put a +1/+1 counter on ~. if that creature was a goblin or orc, put two +1/+1 counters on ~ instead.'));
  fired.length = 0; ug.fxT[0].run(me, { c: { id: 8, types: ['human'] } }); ug.fxT[0].run(me, { c: { id: 9, types: ['orc'] } });
  assert.deepEqual(fired, [[{ k: 'selfCounters', n: 1 }], [{ k: 'selfCounters', n: 2 }]]);
  const gi = {}; assert.ok(l9Line(gi, "whenever another creature you control dies, put a +1/+1 counter on ~. when this ability resolves for the third time this turn, ~ fights up to one target creature you don't control."));
  fired.length = 0; const gm = { id: 20, zone: 'bf' }; for (let i = 0; i < 4; i++) gi.fxT[0].run(gm, { c: { id: 30 + i } });
  assert.deepEqual(fired.map(o => o.map(x => x.k)), [['selfCounters'], ['selfCounters'], ['selfCounters', 'fight'], ['selfCounters']]);
  const sa = {}; assert.ok(l9Line(sa, 'whenever ~ or another nontoken creature you control with power 2 or less enters, create a 1/1 white halfling creature token.'));
  const sr = {}; assert.ok(l9Line(sr, 'whenever a land you control enters, you may pay {1}{g}{u}. if you do, return ~ from your graveyard to your hand.'));
  assert.equal(sr.l9GyLandfall[0].k, 'mayPay');
  assert.match(html, /const o = abOf\(D\(g\)\)\.l9GyLandfall; if \(o\) trigger\(g, o\);/);
  const sb = {}; assert.ok(l9Line(sb, 'whenever one or more creatures your opponents control die, you create a treasure token. this ability triggers only once each turn.'));
  fired.length = 0; const ban = { id: 40, zone: 'bf' }; sb.fxT[0].run(ban, { c: {} }); sb.fxT[0].run(ban, { c: {} }); assert.equal(fired.length, 1);
  const bo = {}; assert.ok(l9Line(bo, 'whenever an opponent casts a spell, if no mana was spent to cast it, counter that spell.')); assert.equal(bo.fxT[0].ev, 'x26cast'); assert.equal(bo.fxT[0].who, 'opp');
  assert.match(html, /if \(c && c\.l9Countered != null\) \{/);
  const bg = {}; assert.ok(l9Line(bg, 'whenever ~ becomes blocked, it deals 1 damage to each creature blocking it.')); assert.equal(bg.l9BlockedDmg, 1);
  // artifacts and enchantments «put into a graveyard from the battlefield» (Lembas)
  assert.match(html, /info\.intended === 'gy' && !info\.wasCre && G\) \{/);
});

const needsTarget = o => ['x26CtrT', 'pumpT'].includes(o.k);
const l9CountSpec = new Function(slice('function l9CountSpec(txt) {', 'function l9Count(spec, s) {') + '\nreturn l9CountSpec;')();
const l9Sentence = new Function('l9CountSpec', 'kwList', 'num', 'needsTarget', slice('const L9_POS =', '{ const _pe = parseEffects; parseEffects = function (s) { const r = typeof s === \'string\' ? l9Sentence') + '\nreturn l9Sentence;')(l9CountSpec, kwList, num, needsTarget);

test('whole sentences', () => {
  assert.deepEqual(l9Sentence('it gets +x/+x until end of turn, where x is the number of legendary creatures you control', parseEffects), [{ k: 'l9SelfPumpX', cnt: ['legendary creatures'] }]);
  assert.deepEqual(l9Sentence('target elf you control gains trample and gets +x/+x until end of turn, where x is the number of forests you control', parseEffects), [{ k: 'l9PumpTX', sub: 'elf', kws: ['trample'], cnt: ['forests'] }]);
  assert.deepEqual(l9Sentence('~ deals x damage to target creature, where x is the number of creatures you control plus the number of foods you control', parseEffects), [{ k: 'l9DmgTX', cnt: ['creatures', 'foods'] }]);
  assert.equal(l9Sentence('~ deals x damage to target creature, where x is the number of cards in your hand', parseEffects), null);
  assert.deepEqual(l9Sentence('up to two target creatures each get +2/+2 and gain trample until end of turn', parseEffects), [{ k: 'l9Multi', n: 2, each: 'pump', p: 2, t: 2, kws: ['trample'] }]);
  assert.deepEqual(l9Sentence('~ deals 1 damage to each of up to two target creatures', parseEffects), [{ k: 'l9Multi', n: 2, each: 'dmg', dmg: 1 }]);
  assert.deepEqual(l9Sentence("put target creature into its owner's library second from the top", parseEffects), [{ k: 'l9LibPosT', pos: 2 }]);
  assert.deepEqual(l9Sentence("you may put it into its owner's library fifth from the top", parseEffects), [{ k: 'l9LibPosSelf', pos: 5 }]);
  assert.deepEqual(l9Sentence('its owner shuffles it into their library', parseEffects), [{ k: 'l9ShuffleSelf' }]);
  assert.deepEqual(l9Sentence('attach it to target creature you control. untap that creature', parseEffects), [{ k: 'attach', f: 'creature you control', l7mark: true }, { k: 'l8UntapLast' }]);
  assert.deepEqual(l9Sentence('attach it to target legendary creature you control', parseEffects), [{ k: 'l9AttachLeg' }]);
  assert.deepEqual(l9Sentence('scry 3, then you may reveal the top card of your library. if a creature card is revealed this way, draw a card', parseEffects), [{ k: 'scry', n: 3 }, { k: 'l9RevealTop', type: 'creature' }]);
  const e = l9Sentence("put an indestructible counter on another target creature you control. draw a card if that creature's power is 2 or less", parseEffects);
  assert.equal(e[0].l8other, true); assert.equal(e[0].l7mark, true); assert.deepEqual(e[1].cnd, { k: 'l9tgtPow', max: 2, text: "that creature's power is 2 or less" });
  assert.deepEqual(l9Sentence('draw a card, then discard a card. if you discard a land card this way, put it from your graveyard onto the battlefield tapped', parseEffects), [{ k: 'l9LootLand' }]);
});
