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

const NUMW = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6 };
const num = s => (/^\d+$/.test(s) ? +s : NUMW[s] ?? 1);
const avSentence = new Function('num', slice('function avSentence(t, orig) {', '// a text with airbend') + '\nreturn avSentence;')(num);

test('airbend sentences become an airbend effect with the right target', () => {
  assert.deepEqual(avSentence('airbend up to one other target nonland permanent'), [{ k: 'avAirbend', f: 'nonland permanent', mine: false, other: true, upTo: true }]);
  assert.deepEqual(avSentence('airbend target creature you control'), [{ k: 'avAirbend', f: 'creature', mine: true, other: false, upTo: false }]);
  assert.deepEqual(avSentence('airbend another target nonland permanent you control'), [{ k: 'avAirbend', f: 'nonland permanent', mine: true, other: true, upTo: false }]);
  // forms the engine can't do yet stay unrecognised (no half effects)
  assert.equal(avSentence('airbend up to one other target creature or spell'), null);
  assert.equal(avSentence('airbend any number of other target nonland permanents you control'), null);
});

test('earthbend sentences keep their number', () => {
  assert.deepEqual(avSentence('earthbend 2'), [{ k: 'avEarthbend', n: 2 }]);
  assert.deepEqual(avSentence('earthbend 1, then earthbend 1'), [{ k: 'avEarthbend', n: 1 }, { k: 'avEarthbend', n: 1 }]);
  assert.deepEqual(avSentence('you earthbend four'), [{ k: 'avEarthbend', n: 4 }]);
  assert.deepEqual(avSentence('earthbend x, where x is the number of forests you control'), [{ k: 'avEarthbend', n: 0, nX: 'forests' }]);
  assert.equal(avSentence("earthbend x, where x is that creature's power"), null);
});

test('a text with an unknown sentence next to airbend/earthbend is not half-applied', () => {
  const wrapper = slice('// a text with airbend/earthbend', '// «firebending N»');
  const make = new Function('avSentence', 'orig', 'let parseEffects = orig;\n' + wrapper + '\nreturn parseEffects;');
  const orig = t => (t === 'draw a card' ? [{ k: 'draw', n: 1 }] : []);
  const pe = make(avSentence, orig);
  assert.deepEqual(pe('airbend target nonland permanent. draw a card.'), [{ k: 'avAirbend', f: 'nonland permanent', mine: false, other: false, upTo: false }, { k: 'draw', n: 1 }]);
  assert.deepEqual(pe('earthbend x, where x is the number of cards in your hand. that land becomes an island in addition to its other types.'), []);
  assert.deepEqual(pe('draw a card'), [{ k: 'draw', n: 1 }]);
});

test('firebending lines add an attack trigger and keep the other keywords', () => {
  const KW_LIST = ['flying', 'menace', 'trample', 'haste'];
  const avLine = new Function('KW_LIST', slice('function avLine(a, l) {', '{ const _el = eoeLine;') + '\nreturn avLine;')(KW_LIST);
  const mk = () => ({ kw: new Set(), attack: [] });
  let a = mk(); assert.equal(avLine(a, 'trample, firebending 4, haste'), true);
  assert.deepEqual([...a.kw], ['trample', 'haste']); assert.deepEqual(a.attack, [{ k: 'avFire', n: 4 }]);
  a = mk(); assert.equal(avLine(a, "firebending x, where x is ~'s power."), true); assert.deepEqual(a.attack, [{ k: 'avFire', n: 'pow' }]);
  a = mk(); assert.equal(avLine(a, "~ has firebending 2 as long as you control a dragon."), false); assert.equal(a.attack.length, 0);
  a = mk(); assert.equal(avLine(a, 'flying, vigilance'), false);
});

test('airbent cards can be cast from exile by their owner for {2}', () => {
  assert.match(html, /if \(g && g\.alt\) \{ cost\.generic = g\.alt\.generic; cost\.pips = g\.alt\.pips\.map\(p => p\.slice\(\)\); cost\.x = 0; c\.xVal = 0; \}/);
  const air = slice('  avAirbend(op, ctx, t) {', '  avEarthbend(op, ctx, t) {');
  assert.match(air, /G\.p\[o\]\.impulse/);
  assert.match(air, /alt: \{ generic: 2, pips: \[\] \}/);
  assert.match(air, /left: 9999/);
});

test('earthbent lands come back tapped and firebending mana ends with combat', () => {
  const mv = slice('{ const _mv = moveCard; moveCard = function (c, to, opts) {', '// firebending mana only lasts');
  assert.match(mv, /\(z === 'gy' \|\| z === 'exile'\) && !c\.token/);
  assert.match(mv, /moveCard\(c, 'bf', \{ ctl: c\.owner \}\); c\.tapped = true;/);
  assert.match(html, /ewAfterCombat = function \(s\) \{ for \(const p of G\.p\) if \(p\.pool && p\.pool\.some\(u => u\.avCombat\)\) p\.pool = p\.pool\.filter\(u => !u\.avCombat\);/);
});
