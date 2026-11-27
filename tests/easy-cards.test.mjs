import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Tanda 12: «easy» cards of the ten sets (group 1)
const html = readFileSync(new URL('../app/index.html', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

function slice(from, to) {
  const begin = html.indexOf(from);
  const end = html.indexOf(to, begin + from.length);
  assert.ok(begin >= 0 && end > begin, `no encuentro ${from}`);
  return html.slice(begin, end);
}

// fake engine pieces
const KW_LIST = ['flying', 'first strike', 'double strike', 'lifelink', 'menace', 'trample', 'haste', 'indestructible', 'hexproof', 'vigilance', 'deathtouch'];
const kwList = t => (t || '').split(/,\s*|\s+and\s+/).map(z => z.trim()).filter(z => KW_LIST.includes(z));
const FX_SING = w => w === 'elves' ? 'elf' : /ies$/.test(w) ? w.slice(0, -3) + 'y' : /ss$/.test(w) ? w : w.replace(/s$/, '');
const tl = c => (c.type || '').toLowerCase();
const isType = (c, t) => new RegExp('\\b' + t + '\\b').test(tl(c));
const isCreature = c => isType(c, 'creature');
const isLand = c => isType(c, 'land');
const fxIs = (c, types) => types.some(t => isType(c, t));
const D = c => ({ type_line: c.type || '', cmc: c.mv || 0, colors: c.colors || [] });
const T = c => c.t || 0;
const hasKw = (c, k) => (c.kws || []).includes(k);
let BF = [];
const permsAll = () => BF;
const card = (o) => Object.assign({ zone: 'bf', ctl: 1, cnt: {}, id: Math.random() }, o);

const filters = new Function('kwList', 'fxIs', 'FX_SING', 'isLand', 'isCreature', 'isType', 'D', 'hasKw', 'T', 'permsAll',
  slice('const L12_NOTSUB =', '/* ---------- counts ---------- */') + '\nreturn { l12Req, l12Match, l12Mod, l12DefMatch, l12Es, L12_TYPES, L12_COL, l12KwList };')(kwList, fxIs, FX_SING, isLand, isCreature, isType, D, hasKw, T, permsAll);
const { l12Req, l12Match, l12Mod, l12DefMatch } = filters;

test('target filters: other, subtypes, controller, mana value, toughness, attacking, modified', () => {
  const src = card({ type: 'Creature — Merfolk' });
  const merfolk = card({ type: 'Creature — Merfolk Wizard' });
  const goblin = card({ type: 'Creature — Goblin', ctl: 2 });
  const r = l12Req('other merfolk you control');
  assert.deepEqual([r.other, r.you, r.alts], [true, true, [['merfolk']]]);
  assert.equal(l12Match(src, r, 1, src, true), false, 'never the source');
  assert.equal(l12Match(merfolk, r, 1, src, true), true);
  assert.equal(l12Match(goblin, l12Req('goblin you control'), 1, src, true), false, 'not mine');
  const mv = l12Req('creature with mana value 3 or greater');
  assert.equal(l12Match(card({ type: 'Creature', mv: 3 }), mv, 1, null, true), true);
  assert.equal(l12Match(card({ type: 'Creature', mv: 2 }), mv, 1, null, true), false);
  const tou = l12Req('creature with toughness 4 or greater');
  assert.equal(l12Match(card({ type: 'Creature', t: 4 }), tou, 1, null, true), true);
  assert.equal(l12Match(card({ type: 'Creature', t: 3 }), tou, 1, null, true), false);
  const atk = l12Req('attacking goblin you control'); const g = card({ type: 'Creature — Goblin' });
  assert.equal(l12Match(g, atk, 1, null, true), false); g.atk = 2; assert.equal(l12Match(g, atk, 1, null, true), true);
  const nl = l12Req('nonland permanent');
  assert.equal(l12Match(card({ type: 'Land' }), nl, 1, null, true), false);
  assert.equal(l12Match(card({ type: 'Artifact' }), nl, 1, null, true), true);
  const nt = l12Req('nontoken artifact or creature');
  assert.deepEqual(nt.alts, [['nontoken', 'artifact'], ['nontoken', 'creature']], '«nontoken» applies to both');
  assert.equal(l12Req('creature card from your graveyard'), null, 'not a battlefield filter');
});

test('modified (CR 700.9): a counter, an Equipment or an Aura of its controller', () => {
  const c = card({ type: 'Creature' }); BF = [c];
  assert.equal(l12Mod(c), false);
  c.cnt.p1 = 1; assert.equal(l12Mod(c), true); c.cnt.p1 = 0;
  BF.push(card({ type: 'Artifact — Equipment', att: c.id })); assert.equal(l12Mod(c), true);
  BF = [c, card({ type: 'Enchantment — Aura', att: c.id, ctl: 2 })]; assert.equal(l12Mod(c), false, "an opponent's Aura does not count");
  BF = [];
});

test('graveyard filters for «return target … card with mana value N or less»', () => {
  assert.equal(l12DefMatch({ type_line: 'Artifact Creature — Robot' }, l12Req('artifact creature')), true);
  assert.equal(l12DefMatch({ type_line: 'Creature — Human' }, l12Req('artifact creature')), false);
  assert.equal(l12DefMatch({ type_line: 'Instant' }, l12Req('nonland permanent')), false, 'an instant is not a permanent card');
  assert.equal(l12DefMatch({ type_line: 'Enchantment' }, l12Req('nonland permanent')), true);
});

// sentences
const KW_ES = {};
const cdNum = w => (/^\d+$/.test(w) ? +w : { four: 4, ten: 10 }[w] || 0);
const l9CountSpec = t => (/^the number of colors among permanents you control$/.test(t) ? ['l12colors'] : /^the number of ([a-z]+) you control$/.test(t) ? [t.split(' ')[3]] : null);
const PE = {
  'destroy target artifact or creature': [{ k: 'destroy', f: 'artifact or creature' }],
  'create a food token': [{ k: 'food' }],
  'draw a card': [{ k: 'draw', n: 1 }],
  'search your library for an enchantment card, reveal it, put it into your hand, then shuffle': [{ k: 'tutor', f: 'enchantment' }],
  'creatures you control get +2/+0 until end of turn': [{ k: 'x26PumpAll', p: 2, t: 0 }],
};
const pe = s => (PE[s] || []).map(o => Object.assign({}, o));
const L12_PLANET = /create a tapped planet land token named new planet with "\{t\}: add one mana of any color\.?"/;
const L12_PLANET_ALL = new RegExp('^' + L12_PLANET.source + '$');
const l12Sentence = new Function('l12Req', 'l12Es', 'L12_TYPES', 'L12_COL', 'l12KwList', 'KW_ES', 'FX_SING', 'l9CountSpec', 'cdNum', 'L12_PLANET_ALL',
  slice('function l12Tgt(', '// rewrites that keep the meaning') + '\nreturn l12Sentence;')(filters.l12Req, filters.l12Es, filters.L12_TYPES, filters.L12_COL, filters.l12KwList, KW_ES, FX_SING, l9CountSpec, cdNum, L12_PLANET_ALL);

test('sentences the old parser dropped', () => {
  const b = l12Sentence("return up to one other target creature you control to its owner's hand", pe)[0];
  assert.deepEqual([b.k, b.base.k, b.req.other, b.req.you, b.upTo], ['l12T', 'bounce', true, true, true]);
  const p = l12Sentence('target klingon gets +1/+1 and gains double strike until end of turn', pe)[0];
  assert.deepEqual([p.base.k, p.base.p, p.base.kws, p.req.alts], ['pumpT', 1, ['double strike'], [['klingon']]]);
  assert.equal(l12Sentence('~ deals 3 damage to target attacking creature', pe)[0].need, 'attacking');
  const tt = l12Sentence('destroy target artifact or creature. if its mana value was 4 or less, create a food token', pe);
  assert.deepEqual(tt.map(o => o.k), ['destroy', 'food'], 'a filter it cannot read does not stop the search (Tainted Treats)');
  assert.deepEqual([tt[0].l7mark, tt[1].cnd.k, tt[1].cnd.mvMax], [true, 'l12tgt', 4]);
  assert.deepEqual(l12Sentence('create a tapped planet land token named new planet with "{t}: add one mana of any color."', pe), [{ k: 'l12Planet' }]);
  const murf = l12Sentence('create murf, a legendary 0/1 green ooze slug creature token with indestructible', pe)[0];
  assert.deepEqual([murf.name, murf.p, murf.t, murf.colors, murf.types, murf.kws], ['Murf', 0, 1, ['G'], 'Ooze Slug', ['indestructible']]);
  assert.deepEqual(l12Sentence('enchanted creature gains trample and indestructible until end of turn', pe), [{ k: 'l12EnchKw', kws: ['trample', 'indestructible'] }]);
  assert.deepEqual(l12Sentence('other spiders you control gain flying, first strike, and haste until end of turn', pe)[0].sel, { other: true, subs: ['spider'] });
  const sh = l12Sentence('draw cards equal to the number of colors among permanents you control', pe)[0];
  assert.deepEqual([sh.k, sh.l11cnt], ['draw', ['l12colors']]);
  assert.deepEqual(l12Sentence('if you have fewer than four cards in hand, draw cards equal to the difference', pe), [{ k: 'l12DrawDiff', n: 4 }]);
  assert.equal(l12Sentence("destroy target creature. if it wasn't attacking, its controller draws a card", pe)[1].cnd.notAtk, true);
  assert.equal(l12Sentence('you may discard a card. if you do, search your library for an enchantment card, reveal it, put it into your hand, then shuffle', pe)[0].tut.k, 'tutor');
  const thor = l12Sentence("exile up to one target nontoken artifact or creature, then return that card to the battlefield tapped under its owner's control", pe)[0];
  assert.deepEqual([thor.base.k, thor.base.tapped, thor.harm], ['l12Blink', true, true]);
  assert.equal(l12Sentence('target creature gets +2/+2 until end of turn, then something odd', pe), null);
});

test('several sentences: only the one the old parser dropped is added', () => {
  const l12Split = new Function(slice('function l12Split(t)', 'const L12_ALONE') + '\nreturn l12Split;')();
  assert.deepEqual(l12Split('draw two cards. create a tapped planet land token named new planet with "{t}: add one mana of any color."'),
    ['draw two cards', 'create a tapped planet land token named new planet with "{t}: add one mana of any color."'], 'the period inside the quotes does not split');
  assert.match(html, /if \(parts\.length > 1 && !parts\.some\(p => \/\^\(if\|then\|otherwise\)\\b\/\.test\(p\)\)\)/);
  assert.match(html, /\{ const _pa12 = parseAct; parseAct = function \(l, raw\) \{ if \(typeof l === 'string' && L12_PLANET\.test\(l\)\)/, 'the quoted «{T}: Add» is not a mana ability');
});

test('conditions on the target also work when the target was a token that is gone', () => {
  const CARDS = {};
  const l11Last = ctx => (ctx && ctx.lastTgt != null && CARDS[ctx.lastTgt]) || null;
  const cdOk = new Function('cdOk', 'l11Last', 'D', 'fxIs', slice('{ const _co12 = cdOk; cdOk = function (sp, ctx) {', "{ const _fc12 = fxCond;") + '\nreturn cdOk;')(() => 'old', l11Last, D, fxIs);
  const ctx = { lastTgt: 7, l12Pre: { id: 7, atk: false, ench: false, ctl: 2, mv: 0 } };
  assert.equal(cdOk({ k: 'l12tgt', notAtk: true }, ctx), true, "Prophesied End on a token");
  assert.equal(cdOk({ k: 'l12tgt', mvMax: 4 }, ctx), true, 'Tainted Treats on a token (mana value 0)');
  ctx.l12Pre.atk = true; assert.equal(cdOk({ k: 'l12tgt', notAtk: true }, ctx), false);
  CARDS[8] = { zone: 'gy', type: 'Enchantment', cnt: {} };
  assert.equal(cdOk({ k: 'l12tgt', ench: true, gone: true }, { lastTgt: 8, l12Pre: { id: 8, ench: true } }), true, "Shredder's Technique");
  assert.equal(cdOk({ k: 'l12tgt', ench: true, gone: true }, { lastTgt: 8, l12Pre: { id: 9, ench: true } }), false, 'a note about another target does not count');
  assert.equal(cdOk({ k: 'other' }, {}), 'old');
});

test('«attacks alone»: only with exactly one attacker, and «~ attacks alone» only for itself', () => {
  assert.match(html, /if \(G && list\.length === 1\) \{/);
  assert.match(html, /if \(al\.self && x\.id !== c\.id\) continue;/);
  assert.match(html, /if \(al\.player && typeof list\[0\]\.to !== 'number'\) continue;/, '«attacks a player alone» (Yuriko)');
});
