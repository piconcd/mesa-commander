import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Tanda 14: the «easy» cards of the Picón CD decks
const html = readFileSync(new URL('../app/index.html', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

function slice(from, to) {
  const begin = html.indexOf(from);
  const end = html.indexOf(to, begin + from.length);
  assert.ok(begin >= 0 && end > begin, `no encuentro ${from}`);
  return html.slice(begin, end);
}

const KW_LIST = ['flying', 'menace', 'haste', 'hexproof', 'indestructible', 'trample', 'vigilance', 'double strike'];
const kwList = t => (t || '').split(/,\s*|\s+and\s+/).map(z => z.trim()).filter(z => KW_LIST.includes(z));
const NUMW = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, ten: 10 };
const num = s => (s == null ? 1 : /^\d+$/.test(s) ? +s : NUMW[String(s).toLowerCase()] ?? 1);
const x26N = w => (w === 'x' ? 'x' : w === 'a' || w === 'an' ? 1 : (num(w) || +w || 0));
const FX_SING = w => /ies$/.test(w) ? w.slice(0, -3) + 'y' : /ss$/.test(w) ? w : w.replace(/s$/, '');
const l13Cap = w => String(w).split(' ').map(x => x ? x[0].toUpperCase() + x.slice(1) : x).join(' ');
const PE = {
  'create two 1/1 red goblin creature tokens': [{ k: 'tokens', n: 2, name: 'Goblin' }],
  'create two 1/1 white soldier creature tokens': [{ k: 'tokens', n: 2, name: 'Soldier' }],
  'target creature gets +1/+0 and gains indestructible until end of turn': [{ k: 'pumpT', p: 1, t: 0, kw: 'indestructible' }],
  'create a 1/1 green elf druid creature token named llanowar elves. it has "{t}: add {g}."': [{ k: 'l13Tok' }]
};
const pe = s => (PE[s] || []).map(o => Object.assign({}, o));
const cnt = slice('const L14_CNT =', '\n');
const l14Sentence = new Function('kwList', 'num', 'x26N', 'FX_SING', 'l13Cap',
  cnt + '\n' + slice('const L14_COLS =', '{ const _pe14 = parseEffects;') + '\nreturn l14Sentence;')(kwList, num, x26N, FX_SING, l13Cap);

test('energy: getting it and paying it as the cost of an activated ability', () => {
  assert.deepEqual(l14Sentence('you get six {e}', pe), [{ k: 'pctr', type: 'energy', n: 6, who: 'you' }]);
  assert.deepEqual(l14Sentence('you get that many {e}', pe), [{ k: 'l14GetE', amt: true }]);
  assert.deepEqual(l14Sentence('you get {e} for each creature you control', pe), [{ k: 'l14GetE', cnt: 'creatures' }], 'Aetherwind Basker: one per creature, not one');
  assert.deepEqual(l14Sentence("you get an amount of {e} equal to the greatest power among creatures you control", pe), [{ k: 'l14GetE', cnt: 'maxPow' }]);
  const COST = []; new Function('X26_COST', 'x26N', slice('X26_COST.unshift(', ');\n') + ');')(COST, x26N);
  const parse = p => { const hit = COST.find(([re]) => re.test(p)); return hit ? hit[1](p.match(hit[0])) : null; };
  assert.deepEqual(parse('pay {e}{e}{e}'), { k: 'energy', n: 3 });
  assert.deepEqual(parse('pay eight {e}'), { k: 'energy', n: 8 });
  assert.deepEqual(parse('put a -1/-1 counter on ~'), { k: 'm1Self' });
  assert.deepEqual(parse("return a forest you control to its owner's hand"), { k: 'bounceF', n: 1, f: 'forest' });
  assert.deepEqual(parse('tap ten untapped elves you control'), { k: 'tapN', n: 10, f: 'elf', other: false });
  assert.deepEqual(parse('sacrifice five treasures'), { k: 'sacN', n: 5, f: 'treasure' });
  assert.equal(parse('pay fifty {e}'), null, 'a number word it does not know is not read (it would become 1)');
  assert.match(html, /if \(x\.k === 'energy' && l14Energy\(s\) < x\.n\) return `Necesitas \$\{x\.n\} de energía/, 'you cannot pay energy you do not have');
});

test('X = number of … and amounts that depend on what you control', () => {
  assert.deepEqual(l14Sentence('create x 1/1 red goblin creature tokens, where x is the number of goblins you control', pe), [{ k: 'l14TokX', tok: { k: 'tokens', n: 2, name: 'Goblin' }, cnt: 'goblins' }]);
  assert.deepEqual(l14Sentence('create x 1/1 white soldier creature tokens, where x is the number of creatures on the battlefield', pe)[0].cnt, 'creaturesAll');
  assert.deepEqual(l14Sentence('~ deals damage to target creature equal to the number of creatures you control', pe), [{ k: 'x26Dmg', n: 0, tg: 'cre', harm: true, l14n: 'creatures' }]);
  assert.deepEqual(l14Sentence('he deals damage equal to the number of dwarves you control to each opponent', pe), [{ k: 'x26DmgEachOpp', n: 0, l14n: 'dwarves' }]);
  assert.deepEqual(l14Sentence('each opponent loses x life, where x is the number of other attacking creatures', pe), [{ k: 'l14OppsLoseX', cnt: 'otherAtk' }]);
  assert.equal(l14Sentence('create x 1/1 red goblin creature tokens, where x is the number of lands you control', pe), null, 'counts it does not know are not guessed');
  const ctx = { seat: 1, src: { id: 9, zone: 'bf' } };
  const G = { turnsTaken: 4, p: { 1: { l14GobT: 4, l14GobN: 3 } }, cards: {} };
  const perms = [{ id: 1, type: 'goblin', cre: true, P: 2 }, { id: 2, type: 'dwarf', cre: true, P: 5 }, { id: 9, type: 'goblin', cre: true, P: 1, atk: 2, ctl: 1 }, { id: 3, type: 'elf', cre: true, P: 1, atk: 2, ctl: 1 }];
  const l14Amt = new Function('G', 'permsOf', 'permsAll', 'isCreature', 'l14IsType', 'isType', 'P', 'l14MaxPow',
    'const l14Src = ctx => ctx && ctx.src ? (G.cards[ctx.src.id] || ctx.src) : null;\n' + slice('function l14Amt(w, ctx) {', 'const L14_CNT') + 'return l14Amt;')(G, () => perms, () => perms, c => c.cre, (c, w) => c.type === w, () => false, c => c.P, () => 5);
  assert.equal(l14Amt('goblins', ctx), 2);
  assert.equal(l14Amt('otherAtk', ctx), 1, 'the attacking creature itself is not counted');
  assert.equal(l14Amt('goblinsIn', ctx), 3);
  G.turnsTaken = 5; assert.equal(l14Amt('goblinsIn', ctx), 0, 'the count is only for this turn');
});

test('spells read whole: morbid and raid «instead», Martial Coup, Hour of Reckoning, «until end of turn, …»', () => {
  assert.deepEqual(l14Sentence('target creature gets -1/-1 until end of turn. that creature gets -13/-13 until end of turn instead if a creature died this turn', pe), [{ k: 'l14Slip', a: [1, 1], b: [13, 13] }]);
  assert.deepEqual(l14Sentence('~ deals 3 damage to target creature. ~ deals 6 damage instead if you attacked this turn', pe), [{ k: 'x26Dmg', n: 3, raid: 6, tg: 'cre', harm: true, l14n: 'raid' }]);
  assert.deepEqual(l14Sentence('create x 1/1 white soldier creature tokens. if x is 5 or more, destroy all other creatures', pe)[0].min, 5);
  assert.deepEqual(l14Sentence('destroy all nontoken creatures', pe), [{ k: 'l14WipeNT' }]);
  assert.deepEqual(l14Sentence('until end of turn, target creature gets +1/+0 and gains indestructible', pe), [{ k: 'pumpT', p: 1, t: 0, kw: 'indestructible' }]);
  assert.deepEqual(l14Sentence('until end of turn, creatures you control gain trample and get +x/+x, where x is the greatest power among creatures you control', pe), [{ k: 'l14PumpAllX', cnt: 'maxPow', kws: ['trample'] }]);
  assert.deepEqual(l14Sentence('airbend up to two target creatures', pe), [{ k: 'l14AirMany', n: 2, other: false, f: 'creature', mine: false }]);
  assert.deepEqual(l14Sentence('target player draws two cards, then discards a card', pe), [{ k: 'l14TgtLoot', n: 2 }], 'the discard is not lost');
  assert.deepEqual(l14Sentence('discard two cards, then draw two cards', pe), [{ k: 'selfDiscard', n: 2 }, { k: 'draw', n: 2 }]);
  assert.match(html, /const died = G\.p\.some\(p => p\.fxDiedT === G\.turnsTaken && p\.fxDiedN > 0\); const \[p, q\] = died \? op\.b : op\.a;/, 'morbid is checked when it resolves');
  assert.match(html, /if \(X >= op\.min\) \{ const ids = new Set\(made\.map\(c => c\.id\)\);/, 'Martial Coup keeps the soldiers it made');
});

test('triggers are wired to the right events', () => {
  assert.match(html, /ev: 'sac', run: x => trigger\(x, \[\{ k: 'dmg', n: 1, f: 'any target' \}\]\)/, 'Mayhem Devil');
  assert.match(html, /if \(info\.c && !\(D\(info\.c\)\.colors \|\| \[\]\)\.includes\('B'\)\) trigger\(x, \[\{ k: 'l14Lose', pl: info\.s, n: 1 \}\]\)/, 'Soot Imp: only nonblack spells, and the caster loses');
  assert.match(html, /ev: 'cast', who: 'opp', nthCast: 2, ops: \[\{ k: 'treasure', n: 1 \}\]/, 'Monologue Tax: the second spell of an opponent');
  assert.match(html, /info\.intended !== 'gy' \|\| !\(info\.wasCre \|\| isType\(c, 'artifact'\)\)/, 'Marionette Apprentice: put into a graveyard, tokens included');
  assert.match(html, /\(info\.c\._l14Att \|\| \[\]\)\.some\(y => y\.id === x\.id\)\) trigger\(x, \[\{ k: 'draw', n: 2 \}\]\)/, 'Skullclamp: only the creature it was equipping');
  assert.match(html, /if \(a\.l14Kreat && atk\.some\(c => l14IsType\(c, 'goblin'\)\)\)/, 'General Kreat: one or more Goblins attack');
  assert.match(html, /const pls = \[\.\.\.new Set\(attacks\.map\(q => q\.to\)\.filter\(q => typeof q === 'number' && G\.p\[q\]\)\)\]/, 'Soaring Lightbringer: one Glimmer per player attacked');
  assert.match(html, /if \(AB\(x\)\.l14Jitte && x\.att != null && dealt\.has\(x\.att\)\)/, 'Jitte: combat damage to players or creatures');
  assert.match(html, /if \(a\.l14EachUpk\) trigger\(x, a\.l14EachUpk, \{ that: s \}\)/, 'each upkeep: the active player is «that player»');
  assert.match(html, /CHWHO\.l14SacNon = \(s, op\) => \(op\.o != null \? \[op\.o\] : \[\]\);/, 'Ruthless Winnower: the player who sacrifices chooses');
  assert.match(html, /CHWHO\.l14Blight = \(s, op\) => \(op\.o != null \? \[op\.o\] : \[\]\);/, 'High Perfect Morcant: each opponent chooses');
  assert.match(html, /CHWHO\.l14Gearhulk = \(s, op\) => \(op\.o != null \? \[op\.o\] : \[\]\);/, 'Combustible Gearhulk: the opponent chooses');
});

test('statics and lands', () => {
  assert.match(html, /if \(!c\.tapped && a\.l14TapOpp8 && l14Opps\(c\.ctl\)\.reduce\(\(n, o\) => n \+ l14Lands\(o\), 0\) < 8\)/, 'Turbulent lands: eight lands among your opponents');
  assert.match(html, /\/\\btreasure\\b\/i\.test\(D\(c\)\.type_line \|\| ''\) && permsOf\(c\.ctl\)\.some\(x => AB\(x\)\.l14Gold\)\) return Math\.max\(n, 2\)/, 'Goldspan Dragon: two mana from each Treasure');
  assert.match(html, /a\.mana = \{ cols: \[m\[2\]\.toUpperCase\(\), m\[3\]\.toUpperCase\(\)\], amt: 1, sac: false, life: \+m\[1\] \}/, '«{T}, pay 1 life: add {G} or {U}» is a mana ability that costs life');
  assert.match(html, /x26NoBot: true, ops: \[\{ k: 'x26Mana', n: 1, cols \}\]/, 'energy / sacrifice mana: an ability that puts mana in the pool');
});
