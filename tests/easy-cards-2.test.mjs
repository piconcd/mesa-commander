import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Tanda 13: «easy» cards of the ten sets (group 2)
const html = readFileSync(new URL('../app/index.html', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

function slice(from, to) {
  const begin = html.indexOf(from);
  const end = html.indexOf(to, begin + from.length);
  assert.ok(begin >= 0 && end > begin, `no encuentro ${from}`);
  return html.slice(begin, end);
}

const KW_LIST = ['flying', 'menace', 'haste', 'hexproof', 'indestructible', 'trample'];
const kwList = t => (t || '').split(/,\s*|\s+and\s+/).map(z => z.trim()).filter(z => KW_LIST.includes(z));
const l12KwList = t => kwList(String(t || '').replace(/,? and /g, ', '));
const FX_SING = w => /ies$/.test(w) ? w.slice(0, -3) + 'y' : /ss$/.test(w) ? w : w.replace(/s$/, '');
const L12_TYPES = ['creature', 'artifact', 'enchantment', 'land', 'planeswalker', 'permanent'];
const L12_COL = { white: 'W', blue: 'U', black: 'B', red: 'R', green: 'G' };
const cdNum = w => (/^\d+$/.test(w) ? +w : { one: 1, two: 2, three: 3, five: 5 }[w] || 0);
const cap = w => w ? w[0].toUpperCase() + w.slice(1) : w;
const PE = { investigate: [{ k: 'avClue', n: 1 }], 'create a food token': [{ k: 'food' }], "put a -1/-1 counter on up to one target creature": [{ k: 'counterT', n: 1, kind: 'm1' }] };
const pe = s => (PE[s] || []).map(o => Object.assign({}, o));
const helpers = slice('const L13_COLS =', 'const l13TypeOk');
const l13Sentence = new Function('parseEffects', 'cdNum', 'FX_SING', 'L12_TYPES', 'L12_COL', 'l12KwList', 'KW_LIST', 'cap',
  helpers + slice('function l13Sentence(s, pe) {', '{ const _pe13 = parseEffects;') + '\nreturn l13Sentence;')(pe, cdNum, FX_SING, L12_TYPES, L12_COL, l12KwList, KW_LIST, cap);

test('«during your turn / an opponent\'s turn» adds a turn condition to every effect', () => {
  const r = l13Sentence('during your turn, investigate', pe);
  assert.deepEqual(r, [{ k: 'avClue', n: 1, cnd: { k: 'l13turn', mine: true, text: "it's your turn" } }]);
  assert.equal(l13Sentence("during an opponent's turn, put a -1/-1 counter on up to one target creature", pe)[0].cnd.mine, false);
  assert.equal(l13Sentence('during your turn, do something unknown', pe), null);
  assert.match(html, /if \(sp && sp\.k === 'l13turn'\) return !!ctx && G && \(G\.active === ctx\.seat\) === !!sp\.mine;/);
});

test('library effects and the creature that entered / died', () => {
  assert.deepEqual(l13Sentence('remove a -1/-1 counter from ~', pe), [{ k: 'l13RmM1' }]);
  assert.deepEqual(l13Sentence('while it has a -1/-1 counter on it, remove a -1/-1 counter from it', pe), [{ k: 'l13RmM1' }]);
  assert.deepEqual(l13Sentence("mill three cards. then return a land card from your graveyard to your hand. if you can't, create a treasure token", pe), [{ k: 'l13Conq', n: 3 }]);
  assert.deepEqual(l13Sentence('look at the top five cards of your library. you may put a creature card from among them onto the battlefield. put the rest on the bottom of your library in a random order', pe), [{ k: 'l13DigBf', n: 5, f: 'creature' }]);
  assert.deepEqual(l13Sentence("you may search your library for a food card, reveal it, put it into your hand, then shuffle. if you don't put a card into your hand this way, create a food token", pe), [{ k: 'l13TutorOr', f: 'food', tok: { k: 'food' } }]);
  assert.deepEqual(l13Sentence('put a +1/+1 counter on each pest, bat, insect, snake, and spider you control', pe), [{ k: 'l13CtrEach', subs: ['pest', 'bat', 'insect', 'snake', 'spider'] }]);
  assert.deepEqual(l13Sentence("you gain 1 life. if it's a spider, put a +1/+1 counter on it", pe), [{ k: 'gain', n: 1 }, { k: 'l13CtrIfIt', sub: 'spider' }]);
  assert.deepEqual(l13Sentence('you may pay life equal to its power. if you do, put that many +1/+1 counters on it', pe), [{ k: 'l13Null' }]);
  assert.deepEqual(l13Sentence('discard a card. if you do, draw two cards', pe), [{ k: 'l13DiscDraw', n: 2 }]);
});

test('tokens with quoted text: name, legendary, colours, keywords, text and who gets it', () => {
  const z = l13Sentence('create zabu, a legendary 2/2 green cat creature token with "landfall — whenever a land you control enters, put a +1/+1 counter on zabu."', pe)[0];
  assert.deepEqual([z.k, z.spec.name, z.spec.p, z.spec.colors, z.spec.type], ['l13Tok', 'Zabu', 2, ['G'], 'Token Legendary Creature — Cat']);
  assert.match(z.spec.text, /counter on Zabu\.$/, 'its own name stays in its text');
  const v = l13Sentence('target opponent creates the void, a legendary 5/5 black horror villain creature token with flying, indestructible, and "the void attacks each combat if able."', pe)[0];
  assert.deepEqual([v.k, v.spec.name, v.spec.kws], ['l13OppTok', 'The Void', ['flying', 'indestructible']]);
  const c = l13Sentence('create a 2/2 colorless wizard soldier creature token named cadet. it gains haste until end of turn', pe)[0];
  assert.deepEqual([c.spec.name, c.spec.colors, c.haste], ['Cadet', [], true]);
  const s = l13Sentence('create a 1/1 colorless sculpture treasure artifact creature token with "{t}, sacrifice ~: add one mana of any color."', pe)[0];
  assert.equal(s.spec.type, 'Token Artifact Creature — Sculpture Treasure');
  assert.match(s.spec.text, /sacrifice this token/);
});

test('triggers that need to know which creature died or how much damage was dealt', () => {
  assert.match(html, /c\._l13Atk = c\.atk != null; if \(isCreature\(c\)\) c\._l13T = T\(c\);/, 'attacking and toughness noted when it leaves');
  assert.match(html, /if \(!c \|\| !c\._l13Atk\) return; trigger\(x, \[\{ k: 'l13ItToHand', id: c\.id \}\]\);/, 'Ares: only an attacking creature');
  assert.match(html, /const got = \(c\.dmg \|\| 0\) - d0; if \(got > 0\) setTimeout0\(\(\) => trigger\(c, \[\{ k: 'l13CtrN', n: got \}\]\)\);/, 'Venus: the damage really dealt');
  assert.match(html, /permsAll\(\)\.some\(x => x\.ctl !== c\.ctl && AB\(x\)\.l13OppTapped\)/, 'Spider-Woman: only opponents');
});

test('another player chooses: Perfect Intimidation and Terrapact Intimidator ask the opponent', () => {
  assert.match(html, /CHWHO\.l13OppExile = \(s, op\) => \(op\.o != null \? \[op\.o\] : \[\]\);/);
  assert.match(html, /CHWHO\.l13Terra = \(s, op\) => \(op\.o != null \? \[op\.o\] : \[\]\);/);
});
