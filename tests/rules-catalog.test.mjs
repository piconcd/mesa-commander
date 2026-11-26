import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cardObjects, compactCard, indexCards, rulesTextURL, madridClock } from '../server/rules-catalog.mjs';
async function* chunks(s) {
  const data=new TextEncoder().encode(s);
  for(let i=0;i<data.length;i+=3) yield data.slice(i,i+3);
}
async function collect(s){const a=[];for await(const x of cardObjects(chunks(s)))a.push(x);return a;}
test('streaming catalog handles nested data, UTF-8, escapes and split chunks',async()=>{
  const input=[{name:'Ángel "test"',nested:[{a:'} ['},1]},{name:'Two'}];
  assert.deepEqual(await collect(JSON.stringify(input)),input);
  await assert.rejects(collect('[{"name":"a"}'),/Truncated/);
  await assert.rejects(collect('[{},]'),/separator/);
  await assert.rejects(collect('[]{}'),/suffix/);
});
test('compact catalog retains faces and legality; ambiguous aliases are rejected',()=>{
  const a=compactCard({object:'card',name:'Fire // Ice',type_line:'Instant // Instant',card_faces:[{name:'Fire',oracle_text:'A'},{name:'Ice',oracle_text:'B'}],legalities:{commander:'legal'}});
  const b=compactCard({object:'card',name:'Other',type_line:'Creature',flavor_name:'Fire'});
  assert.equal(a.card_faces[1].oracle_text,'B');
  assert.equal(a.legalities.commander,'legal');
  assert.equal(indexCards([a]).get('fire'),a);
  assert.equal(indexCards([a,b]).get('Fire'),null);
  const c=compactCard({object:'card',name:'Fire',type_line:'Instant'});
  assert.equal(indexCards([a,b,c]).get('fire'),c);
});
test('official rules link and Madrid timezone',()=>{
  assert.equal(rulesTextURL('<a href="https://media.wizards.com/2026/downloads/MagicCompRules%2020261106.txt">TXT</a>'),'https://media.wizards.com/2026/downloads/MagicCompRules%2020261106.txt');
  assert.throws(()=>rulesTextURL('<a href="https://evil.invalid/MagicCompRules.txt">TXT</a>'),/Invalid/);
  assert.equal(madridClock(new Date('2026-11-26T06:00:00Z')).hour,7);
  assert.equal(madridClock(new Date('2026-07-01T05:00:00Z')).hour,7);
});
const central=readFileSync(new URL('../server/central.js',import.meta.url),'utf8');
function extract(a,b,name){
  const i=central.indexOf(a),j=central.indexOf(b,i+a.length);
  assert.ok(i>=0&&j>i);
  return new Function(central.slice(i,j)+'\nreturn '+name)();
}
test('optional phrases do not convert mandatory or conditional abilities',()=>{
  const parse=extract('function mcOptionalEffect','const mcOriginalParseEffects','mcOptionalEffect');
  assert.deepEqual(parse('you may draw a card.'),{k:'mcOptional',effect:{k:'draw',n:1}});
  assert.deepEqual(parse('you may gain 3 life'),{k:'mcOptional',effect:{k:'gain',n:3}});
  assert.equal(parse('draw a card'),null);
  assert.equal(parse('you may draw a card. if you do, discard a card'),null);
});
test('opposite counters cancel only on battlefield permanents',()=>{
  const cancel=extract('function mcCancelOppositeCounters','const mcOriginalSba','mcCancelOppositeCounters');
  const cards=[{zone:'bf',cnt:{p1:4,m1:2,charge:1}},{zone:'bf',cnt:{p1:1,m1:3}},{zone:'gy',cnt:{p1:2,m1:2}}];
  cancel(cards);
  assert.deepEqual(cards.map(c=>c.cnt),[{p1:2,m1:0,charge:1},{p1:0,m1:2},{p1:2,m1:2}]);
});
test('central syntax and integration anchors',()=>{
  new Function(central);
  assert.match(central,/XPROMPT\.mcOptional/);
  assert.match(central,/return mcStartWithOracle\(link\)/);
  assert.match(central,/signature!==mcDeckSignature\(\)/);
});
