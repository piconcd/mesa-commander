import test from 'node:test';
import assert from 'node:assert/strict';
import {toNexusDeck, validateNexusDeck} from '../server/xmage-deck.mjs';
const deck = {name:'Test',cmd:['Avatar Aang'],list:[{n:'Plains',q:99}]};
test('explicit commander is never guessed from card order',()=>{
  const result=toNexusDeck(deck);
  assert.deepEqual(result.commanders,[{cardName:'Avatar Aang',amount:1}]);
  assert.deepEqual(result.cards,[{cardName:'Plains',amount:99}]);
  assert.deepEqual(toNexusDeck({...deck,list:[...deck.list,{n:'Avatar Aang',q:1}]}),result);
});
test('invalid quantities, size and commander fail closed',()=>{
  for(const bad of [{...deck,cmd:[]},{...deck,list:[{n:'Plains',q:-1}]},{...deck,list:[{n:'Plains',q:98}]}]) assert.throws(()=>toNexusDeck(bad));
});
test('format and catalog must both be ready and valid',async()=>{
  const options={deckType:'Commander',gameType:'Commander'};
  const calls=[];
  const request=async(action,args)=>{calls.push([action,args]);return action==='validateDeck'?{ready:true,missing:[],mismatches:[]}:{ready:true,supported:true,valid:true};};
  assert.deepEqual(await validateNexusDeck(request,deck,options),toNexusDeck(deck));
  assert.deepEqual(calls.map(c=>c[0]),['validateDeck','validateDeckFormat']);
  for(const report of [{ready:false},{ready:true,missing:[{}],mismatches:[]},{ready:true,missing:[],mismatches:[{}]}]) await assert.rejects(validateNexusDeck(async()=>report,deck,options));
  await assert.rejects(validateNexusDeck(async action=>action==='validateDeck'?{ready:true,missing:[],mismatches:[]}:{ready:true,supported:true,valid:false},deck,options));
});
