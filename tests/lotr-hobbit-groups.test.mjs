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

const KW_LIST = ['flying', 'lifelink', 'indestructible', 'trample'];
const kwList = t => (t || '').split(/,\s*|\s+and\s+/).map(z => z.trim()).filter(z => KW_LIST.includes(z));
const FX_SING = w => w.replace(/s$/, '');
const cap = s => s[0].toUpperCase() + s.slice(1);
const parseCost = c => ({ generic: +(c.match(/\{(\d+)\}/) || [0, 0])[1], pips: (c.match(/\{[a-z/]+\}/g) || []).map(p => [p.slice(1, -1).toUpperCase()]) });
const PE_MAP = {
  'search your library for a basic land card, put it onto the battlefield tapped, then shuffle': [{ k: 'ramp', n: 1 }],
  'look at the top five cards of your library. you may reveal a creature card from among them and put it into your hand. put the rest on the bottom of your library in a random order': [{ k: 'dig', n: 5 }],
  'you may sacrifice a food. if you do, draw a card': [{ k: 'cdMay', cost: { sac: 'food' }, ops: [{ k: 'draw', n: 1 }] }],
  'you may sacrifice another creature or a token. if you do, draw a card': [{ k: 'cdMay', cost: { sac: 'creature or a token', other: true }, ops: [{ k: 'draw', n: 1 }] }],
  'target creature an opponent controls gets -2/-2 until end of turn': [{ k: 'shrinkT', n: 2 }],
  'search your library for up to two basic land cards, put them onto the battlefield tapped, then shuffle': [{ k: 'ramp', n: 2 }],
  'search your library for up to three basic land cards, put them onto the battlefield tapped, then shuffle': [{ k: 'ramp', n: 3 }],
};
const parseEffects = s => (PE_MAP[s] || []).map(o => Object.assign({}, o));
const l7Safe = (eff, ops) => !!ops && ops.length > 0;
const x26Trig = (a, tr) => { (a.fxT ||= []).push(tr); return true; };
const fired = []; const trigger = (x, ops, extra) => fired.push({ ops, extra });
const env = { PENDING_MODAL: null };
const L10_NUM = { two: 2, three: 3, four: 4, nine: 9, fourteen: 14 };
const l10Line = new Function('parseEffects', 'kwList', 'FX_SING', 'cap', 'parseCost', 'l7Safe', 'x26Trig', 'trigger', 'L10_NUM', 'env',
  slice('function l10Line(a, l) {', '{ const _el = eoeLine; eoeLine = function (a, l, PE) { if (l10Line').replace(/PENDING_MODAL/g, 'env.PENDING_MODAL') + '\nreturn l10Line;')(parseEffects, kwList, FX_SING, cap, parseCost, l7Safe, x26Trig, trigger, L10_NUM, env);
const newA = () => ({ acts: [], gyActs: [], equipAttack: [], allyCombatDmg: [] });

test('grupo 1: activated abilities become real abilities', () => {
  const g = newA(); assert.ok(l10Line(g, '{t}, sacrifice another creature: target player loses 1 life. if the sacrificed creature was legendary, amass orcs 2.'));
  assert.equal(g.acts[0].sacOther, 'creature'); assert.equal(g.acts[0].tap, true); assert.equal(g.acts[0].ops[1].cnd.k, 'l10sacLeg');
  const ar = newA(); assert.ok(l10Line(ar, '{1}, remove an indestructible counter from ~: another target creature gains indestructible until end of turn. put a +1/+1 counter and a lifelink counter on that creature and a +1/+1 counter and a lifelink counter on ~.'));
  assert.deepEqual(ar.acts[0].rmCtr, { kind: 'indestructible', n: 1 }); assert.equal(ar.acts[0].ops[0].l8other, true);
  const io = newA(); assert.ok(l10Line(io, '{t}: untap another target permanent.')); assert.ok(l10Line(io, '{t}: untap two other target legendary creatures.')); assert.equal(io.acts.length, 2);
  const k = newA(); assert.ok(l10Line(k, '{1}, {t}, discard a legendary card with the same name as a legendary permanent you control: draw two cards.')); assert.equal(k.acts[0].cond.l10Key, true);
  const ep = newA(); assert.ok(l10Line(ep, '{t}, pay 1 life, sacrifice ~: search your library for a basic land card, put it onto the battlefield tapped, then shuffle. you may behold an elf. if you do, untap that land.'));
  assert.deepEqual([ep.acts[0].life, ep.acts[0].sac, ep.acts[0].ops.map(o => o.k)], [1, true, ['ramp', 'l10BeholdUntap']]);
  const bp = newA(); assert.ok(l10Line(bp, 'sacrifice a food: until end of turn, target creature you control assigns combat damage equal to its toughness rather than its power.')); assert.equal(bp.acts[0].sacOther, 'food');
  const li = newA(); assert.ok(l10Line(li, '{4}{u}{u}, exile ~: draw a card for each verse counter on ~. if it had seven or more verse counters on it, take an extra turn after this one. activate only as a sorcery.'));
  assert.equal(li.acts[0].cond.sorcery, true);
  const sa = newA(); assert.ok(l10Line(sa, 'tap two other untapped halflings you control: ~ gets +2/+0 and gains lifelink until end of turn.')); assert.deepEqual(sa.acts[0].cond.l10Untapped, { sub: 'halfling', n: 2 });
  const er = newA(); assert.ok(l10Line(er, '{2}{w/u}{w/u}: return ~ from your graveyard to the battlefield attached to target creature you control with power 1 or less. activate only as a sorcery.'));
  assert.equal(er.gyActs[0].x26cond.sorcery, true); assert.deepEqual(er.gyActs[0].ops, [{ k: 'l10AuraBack', powMax: 1 }]);
});

test('grupo 2: combat lines', () => {
  const t = newA(); assert.ok(l10Line(t, "~ can't be blocked except by three or more creatures.")); assert.equal(t.l10MinBlk, 3);
  const b = newA(); assert.ok(l10Line(b, 'whenever equipped creature blocks or becomes blocked by a creature, that creature loses all abilities until end of turn.')); assert.equal(b.l10Barrow, true);
  const s = newA(); assert.ok(l10Line(s, 'at the beginning of each combat, untap equipped creature.')); assert.ok(l10Line(s, "equipped creature has first strike as long as it's blocking or blocked by a goblin or orc."));
  assert.deepEqual(s.l10FsVs, ['goblin', 'orc']);
  const e = newA(); assert.ok(l10Line(e, 'whenever ~ deals damage to a goblin or orc, destroy that creature.')); assert.deepEqual(e.l10DmgDestroy, ['goblin', 'orc']);
  const l = newA(); assert.ok(l10Line(l, 'whenever two or more creatures you control attack a player, target attacking creature without flying gains flying until end of turn.'));
  fired.length = 0; l.fxT[0].run({}, { def: 2 }); assert.deepEqual(fired[0], { ops: [{ k: 'l10FlyAtk' }], extra: { def: 2 } });
  const h = newA(); assert.ok(l10Line(h, 'whenever two or more creatures you control attack a player, look at the top five cards of your library. you may reveal a creature card from among them and put it into your hand. put the rest on the bottom of your library in a random order.'));
  const mt = newA(); assert.ok(l10Line(mt, "whenever you attack with one or more goblins and/or orcs, create a 2/1 colorless construct artifact creature token with flying named ballistic boulder that's tapped and attacking. sacrifice that token at end of combat."));
  assert.deepEqual(mt.l10Trebuchet, { types: ['goblin', 'orc'], p: 2, t: 1, sub: 'Construct', name: 'Ballistic Boulder' });
  const an = newA(); assert.ok(l10Line(an, 'whenever equipped creature attacks, create two tapped 1/1 white spirit creature tokens with flying. if that creature is legendary, instead create two of those tokens that are tapped and attacking.')); assert.deepEqual(an.equipAttack, [{ k: 'l10Anduril' }]);
  // Gorbag takes the pending «choose one» and its modes are filled later
  const gb = newA(); env.PENDING_MODAL = { n: 1, modes: [] };
  assert.ok(l10Line(gb, 'whenever a goblin or orc you control deals combat damage to a player, you may sacrifice it. when you do, §modal§'));
  assert.equal(env.PENDING_MODAL, null); assert.equal(gb._pm.n, 1); assert.equal(gb.allyCombatDmg[0].ops[0].ops[0].md, gb._pm);
  // illegal blocks are removed; Barrow-Blade; the defending player chooses among the weakest
  assert.match(html, /if \(n && bids\.length < n\) \{ for \(const b of bids\) delete blocks\[b\];/);
  assert.match(html, /CHWHO\.l10LeastSac = \(s, op, ctx\) => ctx && ctx\.def != null && l10Least\(ctx\.def\)\.length > 1 \? \[ctx\.def\] : \[\];/);
});

test('grupo 2: other lines', () => {
  const d = newA(); assert.ok(l10Line(d, '~ enters with a hope counter on it for each creature you control.')); assert.equal(d.l10EntersPer, 'hope');
  const w = newA(); assert.ok(l10Line(w, '~ enters tapped with nine stun counters on it.')); assert.deepEqual([w.entersTapped, w.l10EntersCtr], [true, ['stun', 9]]);
  const m = newA(); assert.ok(l10Line(m, 'whenever you scry, tap up to x target nonland permanents, where x is the number of cards looked at while scrying this way.'));
  fired.length = 0; m.fxT[0].run({}, { n: 2 }); m.fxT[0].run({}, { n: 0 }); assert.deepEqual(fired.map(f => f.ops), [[{ k: 'l10TapUpTo', n: 2 }]]);
  const ag = newA(); assert.ok(l10Line(ag, 'whenever the ring tempts you, if you chose a creature other than ~ as your ring-bearer, put your choice of a counter from among first strike, vigilance, deathtouch, and lifelink on ~.'));
  const me = { id: 1 }; fired.length = 0; ag.fxT[0].run(me, { c: me }); ag.fxT[0].run(me, { c: { id: 2 } }); assert.equal(fired.length, 1);
  const bu = newA(); assert.ok(l10Line(bu, "when a legendary creature an opponent controls dies, put ~ on the bottom of its owner's library."));
  const tb = newA(); assert.ok(l10Line(tb, 'whenever the final chapter ability of a saga you control resolves, reveal cards from the top of your library until you reveal a saga card. put that card onto the battlefield and the rest on the bottom of your library in a random order. this ability triggers only once each turn.'));
  assert.equal(tb.l10TomSaga, true);
});

const cdCond = c => (c === 'you control a creature with power 4 or greater' ? { k: 'ctl', n: 1, f: 'creature', pow: 4, text: c } : null);
const l10Sentence = new Function('kwList', 'L10_NUM', 'cdCond', slice('function l10Sentence(s, pe) {', '{ const _pe = parseEffects; parseEffects = function (s) { const r = typeof s === \'string\' ? l10Sentence') + '\nreturn l10Sentence;')(kwList, L10_NUM, cdCond);

test('grupo 2: whole sentences', () => {
  assert.deepEqual(l10Sentence('create fourteen treasure tokens', parseEffects), [{ k: 'treasure', n: 14, forTgt: false }]);
  const ne = l10Sentence('draw two cards. if the sacrificed creature was legendary, draw three cards instead', parseEffects);
  assert.deepEqual(ne.map(o => [o.n, o.cnd.k || 'not']), [[2, 'not'], [3, 'l10sacLeg']]);
  const pb = l10Sentence("you may sacrifice a food. if you do, target creature gets +4/+4 until end of turn. otherwise, that creature gets +2/+2 until end of turn", parseEffects);
  assert.deepEqual(pb.map(o => o.k), ['pumpT', 'cdMay']); assert.deepEqual([pb[0].p, pb[1].ops[0].p], [2, 2], '+2/+2 always and +2/+2 more if the Food is sacrificed');
  assert.deepEqual(l10Sentence('you may sacrifice another creature or a token. when you do, target creature an opponent controls gets -2/-2 until end of turn', parseEffects)[0].ops, [{ k: 'shrinkT', n: 2 }]);
  assert.deepEqual(l10Sentence('up to two target creatures you control each gain lifelink until end of turn', parseEffects), [{ k: 'l9Multi', n: 2, each: 'pump', p: 0, t: 0, kws: ['lifelink'], mine: true }]);
  assert.deepEqual(l10Sentence("the ring tempts you, then each player mills cards equal to your ring-bearer's power", parseEffects), [{ k: 'fxTempt' }, { k: 'l10MillRB' }]);
  assert.deepEqual(l10Sentence("up to one target creature can't block for as long as you control ~. the ring tempts you", parseEffects), [{ k: 'l10CantBlkWhile' }, { k: 'fxTempt' }]);
  const er = l10Sentence('sacrifice a land. search your library for up to two basic land cards, put them onto the battlefield tapped, then shuffle. if you control a creature with power 4 or greater, instead search your library for up to three basic land cards, put them onto the battlefield tapped, then shuffle', parseEffects);
  assert.deepEqual(er.map(o => [o.k, o.n, o.cnd ? (o.cnd.not ? 'no' : 'si') : '']), [['l10SacLand', undefined, ''], ['ramp', 2, 'no'], ['ramp', 3, 'si']]);
  assert.deepEqual(l10Sentence("destroy target creature. if its controller has more than four cards in hand, they exile cards from their hand equal to the difference", parseEffects), [{ k: 'destroy', f: 'creature', l7mark: true }, { k: 'l10Isildur', max: 4 }]);
  assert.deepEqual(l10Sentence('defending player sacrifices a creature with the least power among creatures they control', parseEffects), [{ k: 'l10LeastSac' }]);
  assert.equal(l10Sentence('create many treasure tokens', parseEffects), null);
});

test('reveal until: never loops when nothing matches', () => {
  const lib = [1, 2, 3]; const cards = { 1: { id: 1 }, 2: { id: 2 }, 3: { id: 3, land: true } };
  const G = { p: { 0: { lib } }, cards };
  const rev = new Function('G', slice('function l10RevealUntil(o, test) {', 'Object.assign(XOPS, {') + '\nreturn l10RevealUntil;')(G);
  const r = rev(0, c => !!c.land); assert.equal(r.hit.id, 3); assert.deepEqual(r.rest.map(c => c.id), [1, 2]);
  G.p[0].lib = [1, 2]; const n = rev(0, c => !!c.land); assert.equal(n.hit, null); assert.equal(n.rest.length, 2);
});
