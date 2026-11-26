import test from 'node:test';
import assert from 'node:assert/strict';
import {newRulesState,createObject,changeZone,dereference,commitAction,queueTrigger,putTriggers,grantPriority,passPriority,resolveTop,counter,replaceEvent,layerOrder,basicSbas} from '../server/engine/core.mjs';
test('priority passes reset on a response, then resolve only top',()=>{
  const s=newRulesState([0,1,2,3]); grantPriority(s);
  const a=commitAction(s,0,{kind:'spell',controller:0}); passPriority(s,0);
  const b=commitAction(s,1,{kind:'spell',controller:1}); assert.deepEqual(s.passes,[]);
  for(const p of [1,2,3]) assert.equal(passPriority(s,p).kind,'priority');
  assert.deepEqual(passPriority(s,0),{kind:'resolve',id:b});
  resolveTop(s,b,()=>true,()=>{}); assert.equal(s.stack.at(-1).id,a);
  grantPriority(s); assert.equal(s.priority,0);
});
test('failed payment is transactional',()=>{
  const s=newRulesState([0,1]);grantPriority(s);
  assert.throws(()=>commitAction(s,0,{kind:'spell',controller:0},draft=>{draft.active=1;return false;}));
  assert.equal(s.active,0);assert.equal(s.stack.length,0);
});
test('APNAP and controller ordering',()=>{
  const s=newRulesState([0,1,2,3],2);
  const a=queueTrigger(s,{kind:'triggered',controller:0});
  const b=queueTrigger(s,{kind:'triggered',controller:2});
  const c=queueTrigger(s,{kind:'triggered',controller:2});
  assert.throws(()=>putTriggers(s));assert.equal(s.stack.length,0);
  assert.deepEqual(putTriggers(s,{2:[c,b]}),[c,b,a]);
});
test('a blink invalidates the previous target reference; all illegal targets do not resolve',()=>{
  const s=newRulesState([0,1]);const target=createObject(s,{owner:1,zone:'bf'});
  grantPriority(s);const id=commitAction(s,0,{kind:'spell',controller:0,targets:[target]});
  const ex=changeZone(s,target,'exile');changeZone(s,ex.object,'bf');assert.equal(dereference(s,target),null);
  passPriority(s,0);passPriority(s,1);
  assert.equal(resolveTop(s,id,(state,t)=>!!dereference(state,t),()=>assert.fail()).kind,'all-targets-illegal');
});
test('replacement choice is reevaluated and each effect applies once',()=>{
  const effects=[{id:'double',applies:e=>e.kind==='counter',apply:e=>({...e,n:e.n*2})},{id:'plus',applies:e=>e.kind==='counter',apply:e=>({...e,n:e.n+1})}];
  assert.deepEqual(replaceEvent({kind:'counter',n:1},effects,(_,ids)=>ids[1]),{event:{kind:'counter',n:4},applied:['plus','double']});
});
test('layer order honors dependencies before timestamp and sorts independent layers',()=>{
  const e=[{id:'a',layer:4,timestamp:1,dependsOn:['b']},{id:'b',layer:4,timestamp:2},{id:'c',layer:1,timestamp:3}];
  assert.deepEqual(layerOrder(e).map(x=>x.id),['c','b','a']);
});
test('basic SBAs collect legend decisions and zero toughness regardless of indestructible',()=>{
  const p=(id)=>({id,generation:0,controller:0,name:'Legend',legendary:true,types:['creature'],toughness:0,indestructible:true});
  const a=basicSbas({players:[],permanents:[p(1),p(2)]});
  assert.deepEqual(a.map(x=>x.kind),['graveyard','graveyard','legend-choice']);
});
