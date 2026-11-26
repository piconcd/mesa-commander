import test from 'node:test';
import assert from 'node:assert/strict';
import {createGame,submit,viewFor,replay,validateCommanderDeck} from '../server/engine/game.mjs';
const definitions={
 island:{name:'Island',reviewed:true,types:['land'],identity:['U'],basic:true,abilities:[{tap:true,mana:true,ops:[{op:'mana',color:'U'}]}]},
 bear:{name:'Bear',reviewed:true,types:['creature'],identity:[],power:2,toughness:2,cost:{generic:1}},
 bolt:{name:'Bolt',reviewed:true,types:['instant'],identity:[],cost:{},targets:[{kind:'any'}],ops:[{op:'damage',target:0,amount:3}]},
 counter:{name:'Counter',reviewed:true,types:['instant'],identity:[],cost:{},targets:[{kind:'stack',stackKind:'spell'}],ops:[{op:'counter',target:0}]},
 legend:{name:'Legend',reviewed:true,types:['creature'],legendary:true,identity:['U'],power:2,toughness:2,cost:{}}
};
const config={seats:[0,1,2],definitions,commander:false,openingHand:5,decks:Object.fromEntries([0,1,2].map(p=>[p,{cards:['island','bear','bolt','counter','legend','island','bear']}]))};
const command=(s,p,c)=>submit(s,p,{...c,revision:s.revision});
const passAll=s=>{for(let i=0;i<3;i++)s=command(s,s.priority,{kind:'pass'});return s;};
const main=()=>passAll(passAll(createGame(config)));
const find=(s,p,card,zone='hand')=>viewFor(s,p).objects.find(o=>o.owner===p&&o.card===card&&o.zone===zone)?.ref;
test('private views and deterministic replay',()=>{
 let s=main();
 assert.equal(s.step,'main1');
 assert.ok(viewFor(s,0).objects.every(o=>o.zone!=='library'&&(o.zone!=='hand'||o.owner===0)));
 assert.deepEqual(replay(config,s.history),s);
});
test('failed actions and stale revisions are atomic',()=>{
 const s=main(),before=JSON.stringify(s);
 assert.throws(()=>command(s,1,{kind:'pass'}));
 assert.throws(()=>submit(s,0,{kind:'pass',revision:-1}));
 assert.throws(()=>command(s,0,{kind:'cast',source:{id:999,generation:0}}));
 assert.equal(JSON.stringify(s),before);
});
test('strict deck validation and unsupported definitions',()=>{
 assert.deepEqual(validateCommanderDeck({commanders:['legend'],cards:Array(99).fill('island')},definitions),[]);
 assert.ok(validateCommanderDeck({commanders:['legend'],cards:Array(99).fill('bear')},definitions).some(x=>x.startsWith('Singleton')));
 assert.throws(()=>createGame({...config,definitions:{...definitions,bad:{name:'Bad',reviewed:false,types:['instant']}}}),/Unreviewed/);
});
test('multiplayer passes advance only after all live seats pass',()=>{
 let s=createGame(config);assert.equal(s.step,'upkeep');
 s=command(s,0,{kind:'pass'});assert.equal(s.priority,1);
 s=command(s,1,{kind:'pass'});assert.equal(s.step,'upkeep');
 s=command(s,2,{kind:'pass'});assert.equal(s.step,'draw');
});
test('concession removes owned cards and leaves remaining players',()=>{
 let s=main();s=command(s,2,{kind:'concede'});
 assert.equal(s.players[2].lost,true);
 assert.ok(Object.values(s.objects).every(o=>o.owner!==2));
 s=command(s,1,{kind:'concede'});assert.deepEqual(s.result,{winner:0});
});
test('mana, spell resolution, counterspell and replay',()=>{
 const cfg={...config,openingHand:7,decks:Object.fromEntries([0,1,2].map(p=>[p,{cards:['island','bear','bolt','counter','legend','island','bear','island']}]))};
 let s=passAll(passAll(createGame(cfg)));
 s=command(s,0,{kind:'land',source:find(s,0,'island')});
 s=command(s,0,{kind:'activate',source:find(s,0,'island','bf'),ability:0});
 s=command(s,0,{kind:'cast',source:find(s,0,'bear')});
 const id=s.stack.at(-1).id;
 s=command(s,0,{kind:'pass'});
 s=command(s,1,{kind:'cast',source:find(s,1,'counter'),targets:[{stack:id}]});
 s=passAll(s);
 assert.equal(s.stack.length,0);
 assert.ok(find(s,0,'bear','graveyard'));
 assert.deepEqual(replay(cfg,s.history),s);
});
