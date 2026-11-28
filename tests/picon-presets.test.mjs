import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// The decks of Picón CD come with the app, grouped under «piconcd»
const html = readFileSync(new URL('../app/index.html', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

function slice(from, to) {
  const begin = html.indexOf(from);
  const end = html.indexOf(to, begin + from.length);
  assert.ok(begin >= 0 && end > begin, `no encuentro ${from}`);
  return html.slice(begin, end);
}

const PRESET_DECKS = new Function(slice('const PRESET_DECKS = [', '\n];') + '\n];\nreturn PRESET_DECKS;')();

test('the twelve decks of Picón CD are in the group «piconcd», each with 100 cards', () => {
  const picon = PRESET_DECKS.filter(p => p.group === 'piconcd');
  assert.equal(picon.length, 12);
  assert.ok(picon.some(p => p.id === 'p-eowyn'), 'the Éowyn deck that was already in the app is his too');
  assert.equal(new Set(PRESET_DECKS.map(p => p.id)).size, PRESET_DECKS.length, 'no repeated ids');
  for (const p of picon) {
    const [cmdPart, deckPart] = p.text.split('\n\nDeck\n');
    const count = s => s.split('\n').filter(l => /^\d+ /.test(l)).reduce((a, l) => a + +l.split(' ')[0], 0);
    assert.equal(count(cmdPart.replace(/^Commander\n/, '')), 1, `${p.name}: one commander`);
    assert.equal(count(deckPart), 99, `${p.name}: 99 more cards`);
  }
});

test('the deck lists show the group', () => {
  const deckGroup = new Function('PRESET_DECKS', slice('function deckGroup(d) {', '\nfunction deckOptions') + '\nreturn deckGroup;')(PRESET_DECKS);
  assert.equal(deckGroup({ id: 'p-picon-goblins' }), 'piconcd', 'decks installed before the group existed get it from the preset');
  assert.equal(deckGroup({ id: 'mine', group: 'otro' }), 'otro');
  assert.equal(deckGroup({ id: 'p-jeleva' }), '');
  assert.match(html, /<optgroup label="\$\{esc\(g\)\}">/);
  assert.match(html, /📁 \$\{esc\(deckGroup\(d\)\)\}/);
});
