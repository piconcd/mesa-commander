import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../app/index.html', import.meta.url), 'utf8');
function section(a,b) {
  const i=source.indexOf(a), j=source.indexOf(b,i+a.length);
  assert.ok(i>=0 && j>i, 'Missing source section: '+a);
  return source.slice(i,j);
}
function extract(code, bindings, name) {
  return new Function(...Object.keys(bindings), code+'\nreturn '+name)(...Object.values(bindings));
}
test('inline JavaScript parses',()=>{
  const scripts=[...source.matchAll(/<script>([\s\S]*?)<\/script>/g)];
  assert.ok(scripts.length);
  for (const [,script] of scripts) new Function(script);
});
const a={id:1,name:'Forest'}, b={id:2,name:'Forest 2'};
const units=[{c:a,cols:['G'],sac:false},{c:b,cols:['G'],sac:false}];
const manaUnits=(_s,exclude)=>units.filter(u=>u.c!==exclude).map(u=>({...u}));
const solveCode=section('function solve(s, cost, excl, poolOnly = false)', '// Offer alternate payments');
test('mana solver rejects insufficient mana, wrong colors and unfunded manual payments',()=>{
  const solve=extract(solveCode,{manaUnits},'solve');
  assert.equal(solve(0,{generic:3,pips:[]}),null);
  assert.equal(solve(0,{generic:0,pips:[['U']]}),null);
  assert.equal(solve(0,{generic:0,pips:[['G']]},null,true),null);
  assert.equal(solve(0,{generic:0,pips:[['G']]}).cards.length,1);
  const withPool=extract(solveCode,{manaUnits:()=>[{pool:0,cols:['G'],sac:false}]},'solve');
  assert.deepEqual(withPool(0,{generic:0,pips:[['G']]},null,true).pool,[0]);
});
test('alternative mana source is selectable without tapping first',async()=>{
  const choose=extract(solveCode+section('function mcManaPlanKey','function pay(s, sol)'),{manaUnits,SET:{autoTap:true},isLand:()=>true,D:c=>c,askChoice:async(_title,labels)=>{assert.equal(labels.length,3);return 1;},__R:(_m,_g,v)=>v,ME:0,G:{}},'mcChooseMana');
  assert.deepEqual((await choose(0,{generic:0,pips:[['G']]})).cards,[b]);
});
test('shockland choice and life payment restrictions',()=>{
  const G={turnsTaken:1,p:[{life:10}]};
  const enter=extract(section('function etbTapUnless(c)','function drawCards'),{G,AB:()=>({tapUnless:{payLife:2}}),permsOf:()=>[],isLand:()=>true,isBotSeat:()=>false,loseLife:(s,n)=>G.p[s].life-=n,log:()=>{},pn:()=>'',cn:()=>''},'etbTapUnless');
  const c={id:1,ctl:0,mcEntryLife:false};
  assert.equal(enter(c),true); assert.equal(G.p[0].life,10);
  c.mcEntryLife=true;
  assert.equal(enter(c),false); assert.equal(G.p[0].life,8);
  G.p[0].life=1; assert.equal(enter(c),true); assert.equal(G.p[0].life,1);
  G.p[0].life=8; G.p[0].lifeLock=1; assert.equal(enter(c),true); assert.equal(G.p[0].life,8);
});
test('affinity for allies reduces generic mana only; commander tax remains',()=>{
  const cost=extract(section('function fullCost(c, s)','function manaUnits'),{D:c=>c.d,parseCost:()=>({generic:2,pips:[['G']],x:0}),G:{p:[{cmdCasts:{1:2}}]},abOf:()=>({}),permsOf:()=>[{ally:true},{ally:true},{ally:true}],AB:()=>({costReduce:[]}),isType:(x,t)=>t==='ally'&&x.ally,eoeCostLess:()=>0},'fullCost');
  assert.deepEqual(cost({id:1,zone:'hand',d:{oracle_text:'Affinity for Allies',type_line:'Instant'}},0).pips,[['G']]);
  assert.equal(cost({id:1,zone:'hand',d:{oracle_text:'Affinity for Allies',type_line:'Instant'}},0).generic,0);
  assert.equal(cost({id:1,zone:'cmdz',d:{type_line:'Creature'}},0).generic,6);
});
test('voice panel clicks remain local',()=>{
  const local=extract(section('function netIsLocal(t)',"['click', 'dblclick', 'contextmenu']"),{},'netIsLocal');
  assert.equal(local({closest:s=>s==='.mc-voice-panel'}),true);
  assert.equal(local({closest:()=>false}),false);
});
