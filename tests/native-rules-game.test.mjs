import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,dispatch,view} from '../server/engine/game.mjs';
const definitions={
  Island:{implemented:true,name:'Island',types:['land'],abilities:[{tap:true,mana:true,effects:[{kind:'mana',color:'U',n:1}]}]},
  Bear:{implemented:true,name:'Bear',types:['creature'],power:2,toughness:2,cost:{generic:1}},
  FreeBear:{implemented:true,name:'Free Bear',types:['creature'],power:2,toughness:2},
  Counter:{implemented:true,name:'Counter',types:['instant'],targets:[{kind:'spell'}],effects:[{kind:'counter',target:0}]},
  Bolt:{implemented:true,name:'Bolt',types:['instant'],targets:[{kind:'creature'}],effects:[{kind:'damage',target:0,n:3}]},
  Bounce:{implemented:true,name:'Bounce',types:['instant'],targets:[{kind:'creature'}],effects:[{kind:'bounce',target:0}]},
  Legend:{implemented:true,name:'Legend',types:['creature'],legendary:true,power:2,toughness:2},
  Wipe:{implemented:true,name:'Wipe',types:['sorcery'],effects:[{kind:'destroyAll'}]},
  Artist:{implemented:true,name:'Artist',types:['creature'],power:0,toughness:1,triggers:[{event:'dies',effects:[{kind:'gain',n:1}]}]}
};
function game(a,b,commanders=[]){return createGame({seats:[0,1],decks:[{library:a,commanders},{library:b}],definitions,startingHand:7,shuffleDecks:false});}
function go(s,p,command){return dispatch(s,p,{...command,version:s.version});}
function passes(s){go(s,s.priority,{kind:'pass'});go(s,s.priority,{kind:'pass'});}
function enterMain(s){passes(s);passes(s);assert.equal(s.step,'main');}
function obj(s,p,name,zone){const o=Object.values(s.objects).find(o=>o.owner===p&&o.name===name&&o.zone===zone);assert.ok(o,name+' '+zone);return {id:o.id,generation:o.generation};}
function cast(s,p,name,targets=[],zone='hand'){go(s,p,{kind:'cast',ref:obj(s,p,name,zone),targets});}
function target(ref){return {kind:'object',...ref};}
test('transactional mana, stale commands and hidden zones',()=>{
  const s=game(['Island','Bear'],['Counter']);enterMain(s);
  const old=JSON.stringify(s);
  assert.throws(()=>cast(s,0,'Bear'));assert.equal(JSON.stringify(s),old);
  assert.throws(()=>dispatch(s,0,{kind:'pass',version:s.version-1}));
  assert.equal(view(s,0).objects.some(o=>o.owner===1&&o.zone==='hand'),false);
  go(s,0,{kind:'land',ref:obj(s,0,'Island','hand')});
  go(s,0,{kind:'activate',ref:obj(s,0,'Island','battlefield'),ability:0});
  go(s,0,{kind:'cast',ref:obj(s,0,'Bear','hand'),payment:['U']});passes(s);
  obj(s,0,'Bear','battlefield');
});
test('counterspell on counterspell resolves LIFO',()=>{
  const s=game(['FreeBear','Counter'],['Counter']);enterMain(s);
  cast(s,0,'Free Bear');go(s,0,{kind:'pass'});
  cast(s,1,'Counter',[{kind:'stack',id:s.stack[0].id}]);go(s,1,{kind:'pass'});
  cast(s,0,'Counter',[{kind:'stack',id:s.stack[1].id}]);
  passes(s);assert.equal(s.stack.length,1);passes(s);obj(s,0,'Free Bear','battlefield');
});
test('commander replacement choice is owner-only and serializable',()=>{
  const s=game([],['Bounce'],['Legend']);enterMain(s);
  cast(s,0,'Legend',[],'command');passes(s);go(s,0,{kind:'pass'});
  cast(s,1,'Bounce',[target(obj(s,0,'Legend','battlefield'))]);passes(s);
  assert.equal(s.decision.kind,'commander-replacement');assert.equal(s.decision.player,0);
  assert.throws(()=>go(s,1,{kind:'choose',yes:true}));
  go(s,0,{kind:'choose',yes:true});obj(s,0,'Legend','command');
});
test('simultaneous deaths use last known trigger sources',()=>{
  const s=game(['Artist','FreeBear','Wipe'],[]);enterMain(s);
  cast(s,0,'Artist');passes(s);cast(s,0,'Free Bear');passes(s);cast(s,0,'Wipe');passes(s);
  assert.equal(s.decision.kind,'trigger-order');go(s,0,{kind:'choose',ids:s.decision.ids});
  assert.equal(s.stack.length,2);passes(s);passes(s);assert.equal(s.players[0].life,42);
});
test('legend selection and combat damage assignment',()=>{
  const s=game(['Legend','Legend'],[]);enterMain(s);
  cast(s,0,'Legend');passes(s);cast(s,0,'Legend');passes(s);
  assert.equal(s.decision.kind,'legend');go(s,0,{kind:'choose',keep:s.decision.refs[0]});
  assert.equal(Object.values(s.objects).filter(o=>o.zone==='battlefield').length,1);
  Object.values(s.objects).find(o=>o.zone==='battlefield').sick=false;
  passes(s);passes(s);assert.equal(s.decision.kind,'attackers');
  go(s,0,{kind:'choose',attackers:[{ref:obj(s,0,'Legend','battlefield'),defender:1}]});
  passes(s);go(s,1,{kind:'choose',blocks:[]});passes(s);
  assert.equal(s.decision.kind,'damage');
  go(s,0,{kind:'choose',assignments:[{source:obj(s,0,'Legend','battlefield'),target:{kind:'player',player:1},n:2}]});
  assert.equal(s.players[1].life,38);
});
test('unsupported definitions cannot start a strict game',()=>{
  assert.throws(()=>createGame({seats:[0,1],decks:[{library:['X']},{library:[]}],definitions:{X:{name:'Unknown',types:['creature']}}}));
});
