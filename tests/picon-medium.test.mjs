import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Tanda 15: the «medium» cards of the Picón CD decks
const html = readFileSync(new URL('../app/index.html', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

function slice(from, to) {
  const begin = html.indexOf(from);
  const end = html.indexOf(to, begin + from.length);
  assert.ok(begin >= 0 && end > begin, `no encuentro ${from}`);
  return html.slice(begin, end);
}

const NUMW = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };
const num = s => (s == null ? 1 : /^\d+$/.test(s) ? +s : NUMW[String(s).toLowerCase()] ?? 1);
const KW = ['flying', 'first strike', 'lifelink', 'hexproof', 'vigilance', 'trample'];
const l12KwList = t => String(t || '').replace(/,? and /g, ', ').split(/,\s*/).map(z => z.trim()).filter(z => KW.includes(z));
const l13Cap = w => String(w).split(' ').map(x => x ? x[0].toUpperCase() + x.slice(1) : x).join(' ');
const L14_COLS = { white: 'W', blue: 'U', black: 'B', red: 'R', green: 'G' };
const PE = { 'scry 2': [{ k: 'scry', n: 2 }] };
const pe = s => (PE[s] || []).map(o => Object.assign({}, o));
const l15Sentence = new Function('num', 'l12KwList', 'l13Cap', 'L14_COLS',
  slice('const L15_TOK =', '{ const _pe15 = parseEffects;') + '\nreturn l15Sentence;')(num, l12KwList, l13Cap, L14_COLS);

test('free casts, cards you look at, Avatar\'s Wrath sentence by sentence', () => {
  assert.deepEqual(l15Sentence('you may cast a noncreature spell from your hand without paying its mana cost', pe), [{ k: 'l15Free', f: 'noncreature', mvCnt: null }]);
  assert.deepEqual(l15Sentence('you may cast a spell with mana value x or less from your hand without paying its mana cost, where x is the number of attacking creatures', pe), [{ k: 'l15Free', f: 'any', mvCnt: 'attackers' }]);
  assert.deepEqual(l15Sentence('~ deals x damage to any target. you may cast a spell with mana value x or less from your hand without paying its mana cost', pe).map(o => o.k), ['x26Dmg', 'l15Free']);
  assert.deepEqual(l15Sentence('choose up to one target creature, then airbend all other creatures', pe), [{ k: 'l15Wrath', lock: false }]);
  assert.deepEqual(l15Sentence("until your next turn, your opponents can't cast spells from anywhere other than their hands", pe), [{ k: 'l15WrathLock' }]);
  assert.deepEqual(l15Sentence('sacrifice ~. if you do, scry 2', pe), [{ k: 'l15SacThen', ops: [{ k: 'scry', n: 2 }] }], 'Aang\'s Iceberg keeps the sacrifice');
  assert.equal(l15Sentence('change the target of target spell or ability with a single target', pe), null, 'changing targets is not invented');
});

test('«until end of turn, …», X tokens, Rooms, Portent', () => {
  assert.deepEqual(l15Sentence('until end of turn, target creature you control becomes an avatar in addition to its other types and gains flying, first strike, lifelink, and hexproof', pe), [{ k: 'l15AvState', type: 'Avatar', kws: ['flying', 'first strike', 'lifelink', 'hexproof'] }]);
  assert.equal(l15Sentence('create x 4/4 white angel creature tokens with flying', pe)[0].spec.name, 'Angel');
  assert.deepEqual(l15Sentence('this room deals 6 damage to target creature an opponent controls. you gain life equal to the excess damage dealt this way', pe), [{ k: 'l15Excess', n: 6 }]);
  assert.deepEqual(l15Sentence('this room deals 4 damage to target creature an opponent controls', pe), [{ k: 'l15Excess', n: 4, noGain: true }]);
  assert.deepEqual(l15Sentence("look at the top three cards of target player's library, then put them back in any order", pe), [{ k: 'l15Portent' }]);
  assert.deepEqual(l15Sentence("draw a card at the beginning of the next turn's upkeep", pe), [{ k: 'l15PortentDraw' }], 'Portent draws next upkeep, not now');
});

test('costs: squad, strive, waterbend as kicker, X and «tap X creatures», energy alternatives', () => {
  assert.match(html, /if \(\(m = t\.match\(\/\^squad \\\{\(\\d\+\)\\\}\$\/\)\)\) \{ a\.multikicker = \+m\[1\];/, 'squad is paid like multikicker');
  assert.match(html, /if \(squad && c\.zone === 'bf'\) trigger\(c, \[\{ k: 'l15Squad', n: squad \}\]\);/, 'and creates that many copies when it enters');
  assert.match(html, /if \(r && c\.kicked && k && k\.l15wb\) r\.wb = \(r\.wb \|\| 0\) \+ k\.l15wb;/, 'Spirit Water Revival: waterbend can tap creatures and artifacts');
  const COST = []; new Function('X26_COST', 'x26N', slice("X26_COST.unshift(\n  [/^tap x untapped", ');\nfunction l15XMax') + ');')(COST, w => num(w));
  const parse = p => { const hit = COST.find(([re]) => re.test(p)); return hit ? hit[1](p.match(hit[0])) : null; };
  assert.deepEqual(parse('tap x untapped creatures you control'), { k: 'tapX' });
  assert.deepEqual(parse('remove two loot counters from ~'), { k: 'rmKind', n: 2, kind: 'loot' });
  assert.deepEqual(parse('sacrifice ~ and a legendary artifact'), { k: 'sacSelfLegArt' });
  assert.match(html, /if \(x\.k === 'xMana' && isBotSeat\(s\) && l15XMax\(act, c, s\) < 1\) return 'X sería 0\.';/, 'bots do not sacrifice Treasure Vault for X = 0');
  assert.match(html, /if \(a\.l15NissaE && isPermDef\(D\(c\)\) && \(pctr\(G\.p\[s\]\)\.energy \|\| 0\) >= 8\)/);
  assert.match(html, /if \(a\.l15LifeEnch && turn && fromHand && isType\(c, 'enchantment'\) && !used\(\) && G\.p\[s\]\.life >= mv\)/, 'Demon of Fate\'s Design: once each of your turns');
});

test('miracle, Rooms, flash, protection and the rest are wired', () => {
  assert.match(html, /if \(c && abOf\(D\(c\)\)\.l15Miracle\) \(G\.l15Mir \|\|= \[\]\)\.push/, 'miracle: only the first card drawn this turn');
  assert.match(html, /if \(fa && !fa\.unparsed\.length && !fa\.manual\.length && !\(fa\.emptyOps \|\| \[\]\)\.length\) \{ a\.manual = a\.manual\.filter/, 'a Room is only automatic when its second door is fully understood');
  assert.match(html, /if \(d\.l15Door2 && abOf\(d\)\.l15DoorOk\) \{ const nd = l15DoorDef\(d\); if \(nd\) \{ c\.n = nd\.name;/, 'unlocking switches to the text of both doors');
  assert.match(html, /if \(a\.l15FlashLegAtk && permsOf\(s\)\.some\(c => c\.atk != null && isCreature\(c\) && \/\\blegendary\\b\/i/, 'Scarring Memories');
  assert.match(html, /if \(op && op\.k === 'attach' && ctx && ctx\.src && G\.cards\[ctx\.src\.id\] && G\.cards\[ctx\.src\.id\]\.l15WardCmd && !\(x && x\.card && x\.card\.isCmd\)\) return false;/, 'Timely Ward with flash must enchant a commander');
  assert.match(html, /if \(AB\(c\)\.l15ProtMv != null && l15Mv\(src\) <= AB\(c\)\.l15ProtMv\) return true;/, 'Reaver Titan');
  assert.match(html, /if \(lost0 === 0 && G\.active === s\) for \(const x of permsAll\(\)\) if \(x\.ctl !== s && AB\(x\)\.l15Valg\)/, 'Valgavoth: the first life loss of an opponent during their turn');
  assert.match(html, /if \(who != null && who !== s && oppsOf\(s\)\.includes\(who\)\) for \(const x of permsOf\(s\)\) if \(AB\(x\)\.l15Crime && x26TurnOnce\(x, 'crime'\)\)/, 'crimes trigger only once each turn');
  assert.match(html, /watch = permsAll\(\)\.filter\(x => x\.att === c\.id && AB\(x\)\.l15DestinyT\)/, 'Avatar Destiny looks back at the Aura');
  for (const k of ['l15Yang', 'l15AzulaEx', 'l15Disorient', 'l15Teach', 'l15Druid']) assert.match(html, new RegExp(`CHWHO\\.${k} = `), `${k}: the other players choose`);
});
