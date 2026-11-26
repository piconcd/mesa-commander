// Native rules runtime. Only reviewed semantic definitions are executable.
// All state is JSON data; a command either commits completely or waits for a decision.
import {newRulesState, createObject, reference, dereference, changeZone, layerOrder, replaceEvent} from './core.mjs';

const clone = v => JSON.parse(JSON.stringify(v));
const fail = message => { throw new Error(message); };
const check = (v,m) => { if (!v) fail(m); };
const same = (a,b) => JSON.stringify(a)===JSON.stringify(b);
const refEqual = (a,b) => a?.id===b?.id && a?.generation===b?.generation;
const colors = ['W','U','B','R','G','C'];
const steps = ['untap','upkeep','draw','main1','beginCombat','attackers','blockers','firstDamage','damage','endCombat','main2','end','cleanup'];
const publicZones = ['bf','graveyard','exile','command','stack'];
const emptyMana = () => Object.fromEntries(colors.map(c=>[c,0]));
const key = r => r.id+':'+r.generation;
const isRef = r => r && Number.isInteger(r.id) && Number.isInteger(r.generation);
const integer = n => Number.isSafeInteger(n) && n>=0;
const manaCost = cost => {
  const out={...emptyMana(),generic:0,X:0};
  for(const [k,v] of Object.entries(cost??{})) {
    check(Object.hasOwn(out,k)&&integer(v),'Unsupported mana cost');
    out[k]=v;
  }
  return out;
};
const live = s => s.seats.filter(p=>!s.players[p].lost);
const player = (s,p) => {check(s.seats.includes(p)&&!s.players[p].lost,'Invalid player');return s.players[p];};
const next = (s,p) => {
  const i=s.seats.indexOf(p);
  for(let n=1;n<=s.seats.length;n++){const q=s.seats[(i+n)%s.seats.length];if(!s.players[q].lost)return q;}
  return null;
};
const ordered = s => {
  const i=s.seats.indexOf(s.active);
  return [...s.seats.slice(i),...s.seats.slice(0,i)].filter(p=>!s.players[p].lost);
};
const objects = (s,zone) => Object.values(s.objects).filter(o=>o.zone===zone);
const battlefield = s => objects(s,'bf').filter(o=>!o.phased);
const get = (s,r) => {const o=dereference(s,r);check(o,'Stale object');return o;};
const def = (s,o) => {const d=s.definitions[o.card];check(d,'Unknown semantic card');return d;};
const rand = s => {
  let x=s.rng>>>0;x^=x<<13;x^=x>>>17;x^=x<<5;s.rng=x>>>0;return s.rng;
};
function shuffle(s,a) {
  for(let i=a.length-1;i>0;i--){const j=rand(s)%(i+1);[a[i],a[j]]=[a[j],a[i]];}
}
function emit(s,event) {s.events.push({...clone(event),seq:++s.eventSeq});}
function choice(ctx,p,kind,options) {
  check(options.length>0,'No legal choice');
  if(options.length===1)return clone(options[0]);
  const index=ctx.cursor++;
  const answer=ctx.answers[index];
  if(!answer)throw new Decision({id:ctx.revision+':'+index,player:p,kind,options:clone(options)});
  check(answer.player===p&&options.some(x=>same(x,answer.value)),'Invalid decision');
  return clone(answer.value);
}
class Decision extends Error {constructor(request){super('Decision required');this.request=request;}}
function orderItems(ctx,p,kind,items) {
  const left=[...items],out=[];
  while(left.length){const id=choice(ctx,p,kind,left.map(x=>x.id));out.push(left.splice(left.findIndex(x=>x.id===id),1)[0]);}
  return out;
}
function characteristics(s,o) {
  const d=def(s,o);
  let c={name:d.name,types:[...(d.types??[])],subtypes:[...(d.subtypes??[])],
    keywords:[...(d.keywords??[])],colors:[...(d.colors??[])],power:d.power??0,toughness:d.toughness??0,
    controller:o.controller,legendary:!!d.legendary,abilities:clone(d.abilities??[]),triggers:clone(d.triggers??[])};
  const effects=[...(s.effects??[]),...battlefield(s).flatMap(source=>
    (def(s,source).continuous??[]).map((e,i)=>({...e,id:'static:'+key(source)+':'+i,timestamp:source.timestamp,source:reference(source)})))];
  for(const e of layerOrder(effects)) {
    const source=e.source&&dereference(s,e.source);
    if(e.source&&(!source||source.zone!=='bf'||source.phased))continue;
    if(e.target&&!refEqual(e.target,reference(o)))continue;
    if(e.scope==='own'&&c.controller!==source?.controller)continue;
    if(e.scope==='other'&&source?.id===o.id)continue;
    if(e.type&&!c.types.includes(e.type))continue;
    if(e.set)Object.assign(c,clone(e.set));
    if(e.addKeywords)c.keywords=[...new Set([...c.keywords,...e.addKeywords])];
    if(e.removeKeywords)c.keywords=c.keywords.filter(k=>!e.removeKeywords.includes(k));
    c.power+=e.power??0;c.toughness+=e.toughness??0;
  }
  c.power+=(o.counters?.plus??0)-(o.counters?.minus??0);
  c.toughness+=(o.counters?.plus??0)-(o.counters?.minus??0);
  return c;
}
function snapshot(s,o){return {...clone(o),...characteristics(s,o)};}
function matches(s,o,filter={},controller) {
  if(!o||o.phased)return false;
  const c=characteristics(s,o);
  return (!filter.zone||o.zone===filter.zone)&&(!filter.type||c.types.includes(filter.type))&&
    (!filter.controller|| (filter.controller==='you'?c.controller===controller:c.controller!==controller))&&
    (!filter.subtype||c.subtypes.includes(filter.subtype));
}
function legalTarget(s,t,spec,p) {
  if(!spec)return false;
  if(t?.player!==undefined)return ['player','any'].includes(spec.kind)&&live(s).includes(t.player)&&(!spec.opponent||t.player!==p);
  if(t?.stack!==undefined)return spec.kind==='stack'&&s.stack.some(x=>x.id===t.stack&&(!spec.stackKind||x.kind===spec.stackKind));
  if(!isRef(t)||!['object','any'].includes(spec.kind))return false;
  const o=dereference(s,t);
  if(!matches(s,o,{zone:'bf',...spec},p))return false;
  const c=characteristics(s,o);
  if(spec.kind==='any'&&!c.types.some(x=>['creature','planeswalker','battle'].includes(x)))return false;
  if(o.zone==='bf'&&(c.keywords.includes('shroud')||(c.keywords.includes('hexproof')&&c.controller!==p)))return false;
  return true;
}
function targets(s,spec,p) {
  return [...live(s).map(player=>({player})),...Object.values(s.objects).map(reference),...s.stack.map(x=>({stack:x.id}))]
    .filter(t=>legalTarget(s,t,spec,p));
}
function selectedTargets(s,specs,p,provided) {
  check(Array.isArray(provided)&&provided.length===specs.length,'Incorrect target count');
  check(provided.every((t,i)=>legalTarget(s,t,specs[i],p)),'Illegal target');
  return clone(provided);
}
function discoverTriggers(s,events,before) {
  const after=battlefield(s).map(o=>snapshot(s,o));
  for(const event of events) {
    // Look back for leave/dies triggers; look forward for enters and ordinary events.
    const sources=['leave','dies'].includes(event.kind)?before:after;
    for(const source of sources) {
      for(const t of source.triggers??[]) {
        if(t.event!==event.kind)continue;
        if(t.self&&!refEqual(event.object,reference(source)))continue;
        if(t.other&&event.object?.id===source.id)continue;
        if(t.you&&event.player!==source.controller)continue;
        if(t.type&&!event.types?.includes(t.type))continue;
        if(!live(s).includes(source.controller))continue;
        s.pending.push({id:s.nextId++,kind:'triggered',controller:source.controller,source:reference(source),
          sourceLki:source,ops:clone(t.ops??[]),specs:clone(t.targets??[]),event:clone(event)});
      }
    }
  }
}
function recordBatch(s,events,before) {
  for(const event of events)emit(s,event);
  discoverTriggers(s,events,before);
}
function replacements(s,event,ctx) {
  const descriptors=battlefield(s).flatMap(o=>(def(s,o).replacements??[]).map((e,i)=>({...e,id:key(o)+':'+i,source:o})));
  const effects=descriptors.map(e=>({id:e.id,rank:e.rank??4,
    applies:v=>v.kind===e.event&&(!e.from||e.from===v.from)&&(!e.to||e.to===v.to)&&
      (!e.you||v.player===e.source.controller)&&(!e.counter||e.counter===v.counter),
    apply:v=>({...v,...(e.redirect?{to:e.redirect}:{}),...(e.multiply?{amount:v.amount*e.multiply}:{}),
      ...(e.add?{amount:v.amount+e.add}:{}),...(e.prevent?{amount:Math.max(0,v.amount-e.prevent)}:{})})}));
  if(event.kind==='move') {
    const o=get(s,event.object);
    if(o.commander&&['hand','library'].includes(event.to))effects.push({id:'commander',rank:4,
      applies:v=>['hand','library'].includes(v.to),
      apply:v=>choice(ctx,o.owner,'commander-replacement',[false,true])?{...v,to:'command'}:v});
  }
  return replaceEvent(event,effects,(v,ids)=>choice(ctx,v.player,'replacement-order',ids)).event;
}
function moveBatch(s,moves,ctx) {
  const before=battlefield(s).map(o=>snapshot(s,o)),events=[],results=[];
  const seen=new Set(),prepared=[];
  for(const m of moves) {
    const o=get(s,m.ref);check(!seen.has(o.id),'Duplicate simultaneous move');seen.add(o.id);
    if(o.zone===m.to)continue;
    const e=replacements(s,{kind:'move',object:m.ref,from:o.zone,to:m.to,player:o.zone==='bf'?characteristics(s,o).controller:o.owner},ctx);
    if(e)prepared.push({m,e,o,snap:snapshot(s,o)});
  }
  for(const {m,e,o,snap} of prepared) {
    if(o.zone===e.to)continue;
    if(o.zone==='library')s.players[o.owner].library=s.players[o.owner].library.filter(id=>id!==o.id);
    const result=changeZone(s,reference(o),e.to,{controller:m.controller});
    o.timestamp=++s.clock;delete o.controlSince;delete o.deathtouchDamage;delete o.commandEligible;
    delete o.blocking;delete o.attacking;delete o.face;delete o.loyaltyActivated;
    if(e.to==='bf'){
      o.controlSince=s.turn;o.tapped=!!m.tapped||!!def(s,o).entersTapped;
      if(def(s,o).loyalty!==undefined)o.counters={loyalty:def(s,o).loyalty};
    }
    if(e.to==='library')s.players[o.owner].library.push(o.id);
    if(o.commander&&['graveyard','exile'].includes(e.to))o.commandEligible=true;
    const common={object:result.object,previous:reference(snap),player:snap.controller,types:snap.types,from:snap.zone,to:e.to,lki:snap};
    events.push({kind:'move',...common});
    if(snap.zone==='bf'){
      events.push({...common,kind:'leave',object:reference(snap)});
      if(e.to==='graveyard')events.push({...common,kind:'dies',object:reference(snap)});
    }
    if(e.to==='bf')events.push({...common,kind:'enter',player:o.controller});
    results.push(result.object);
  }
  recordBatch(s,events,before);return results;
}
function draw(s,p,n,ctx) {
  const pl=player(s,p);
  for(let i=0;i<n;i++){
    const id=pl.library.at(-1);
    if(id===undefined){pl.drewEmpty=true;continue;}
    moveBatch(s,[{ref:reference(s.objects[id]),to:'hand'}],ctx);
    recordBatch(s,[{kind:'draw',player:p}],battlefield(s).map(o=>snapshot(s,o)));
  }
}
function counterObject(s,id,ctx) {
  const i=s.stack.findIndex(x=>x.id===id);
  if(i<0||s.stack[i].uncounterable)return;
  const item=s.stack.splice(i,1)[0];
  if(item.cardRef&&dereference(s,item.cardRef))moveBatch(s,[{ref:item.cardRef,to:item.destination??'graveyard'}],ctx);
  emit(s,{kind:'counter',stack:id});
}
function damageBatch(s,hits,ctx) {
  const before=battlefield(s).map(o=>snapshot(s,o)),events=[];
  const prepared=hits.map(h=>{
    const recipient=h.target.player!==undefined?h.target.player:characteristics(s,get(s,h.target)).controller;
    return {...h,event:replacements(s,{kind:'damage',amount:h.amount,player:recipient,combat:!!h.combat},ctx)};
  });
  for(const h of prepared){
    const n=h.event?.amount??0;if(!n)continue;
    const source=h.source;
    if(h.target.player!==undefined){
      const p=player(s,h.target.player);p.life-=n;
      if(h.combat&&source?.commander)p.commanderDamage[source.id]=(p.commanderDamage[source.id]??0)+n;
    }else{
      const o=get(s,h.target),c=characteristics(s,o);
      if(c.types.includes('planeswalker')){o.counters??={};o.counters.loyalty=(o.counters.loyalty??0)-n;}
      else if(c.types.includes('battle'))fail('Battle damage not supported');
      else {o.damage=(o.damage??0)+n;if(source?.keywords?.includes('deathtouch'))o.deathtouchDamage=true;}
    }
    if(source?.keywords?.includes('lifelink')&&live(s).includes(source.controller))s.players[source.controller].life+=n;
    events.push({kind:'damage',player:h.event.player,amount:n,combat:!!h.combat,source:source?reference(source):null,target:h.target});
  }
  recordBatch(s,events,before);
}
function resolveOps(s,item,selected,ctx) {
  const p=item.controller;
  for(const op of item.ops??[]) {
    const target=op.target===undefined?null:selected[op.target];
    if(op.target!==undefined&&!target)continue;
    const who=op.player==='event'?item.event?.player:target?.player??p;
    const n=op.amount==='X'?item.x:op.amount??1;
    switch(op.op){
      case 'draw':draw(s,who,n,ctx);break;
      case 'gain':player(s,who).life+=n;break;
      case 'lose':player(s,who).life-=n;break;
      case 'damage':damageBatch(s,[{target,amount:n,source:item.sourceLki}],ctx);break;
      case 'counter':counterObject(s,target.stack,ctx);break;
      case 'move':moveBatch(s,[{ref:target,to:op.to}],ctx);break;
      case 'destroy':case 'destroyAll':{
        const list=op.op==='destroy'?[get(s,target)]:battlefield(s).filter(o=>matches(s,o,op.filter,p));
        moveBatch(s,list.filter(o=>!characteristics(s,o).keywords.includes('indestructible')).map(o=>({ref:reference(o),to:'graveyard'})),ctx);break;
      }
      case 'counters':{
        const o=get(s,target);const e=replacements(s,{kind:'counters',player:o.controller,amount:n,counter:op.counter},ctx);
        if(e){o.counters??={};o.counters[op.counter]=(o.counters[op.counter]??0)+e.amount;}break;
      }
      case 'mana':player(s,p).mana[op.color]+=n;break;
      case 'mayPay':{
        const payer=op.payer==='event'?item.event.player:p;
        if(!live(s).includes(payer))break;
        const c=manaCost(op.cost),options=[false];
        if(canPay(s,payer,c,0))options.push(true);
        if(choice(ctx,payer,'may-pay',options))pay(s,payer,c,0);
        else resolveOps(s,{...item,ops:op.otherwise??[]},selected,ctx);
        break;
      }
      case 'temporary':s.effects.push({...clone(op.effect),id:'effect:'+s.nextId++,target,timestamp:++s.clock,untilTurn:s.turn});break;
      default:fail('Unsupported semantic operation: '+op.op);
    }
  }
}
function losePlayers(s,losers,ctx) {
  for(const p of losers){s.players[p].lost=true;emit(s,{kind:'lose',player:p});}
  const removed=new Set(losers);
  s.stack=s.stack.filter(x=>!removed.has(x.controller)&&(!x.cardRef||!removed.has(dereference(s,x.cardRef)?.owner)));
  s.pending=s.pending.filter(x=>!removed.has(x.controller));
  for(const o of Object.values(s.objects)){
    if(removed.has(o.owner)){delete s.objects[o.id];continue;}
    if(removed.has(o.controller)){
      if(o.zone==='bf')moveBatch(s,[{ref:reference(o),to:'exile'}],ctx);
      else if(o.zone==='stack')moveBatch(s,[{ref:reference(o),to:'exile'}],ctx);
      else o.controller=o.owner;
    }
  }
  s.effects=s.effects.filter(e=>!removed.has(e.controller)&&(!e.source||dereference(s,e.source)));
  const remaining=live(s);
  if(remaining.length<=1){s.result=remaining.length?{winner:remaining[0]}:{draw:true};s.priority=null;}
  else if(removed.has(s.active))s.active=next(s,s.active);
}
function stabilize(s,ctx) {
  // A repeated exact position is not silently treated as a successful SBA pass.
  const seen=new Set();
  while(!s.result){
    const fingerprint=JSON.stringify([s.players,s.objects,s.stack,s.effects]);
    check(!seen.has(fingerprint),'Repeated SBA position requires loop adjudication');seen.add(fingerprint);
    const losers=live(s).filter(p=>{
      const v=s.players[p];return v.life<=0||v.poison>=10||v.drewEmpty||Object.values(v.commanderDamage).some(n=>n>=21);
    });
    const moves=new Map(),groups=new Map();let changed=false;
    for(const o of battlefield(s)){
      const c=characteristics(s,o),r=reference(o);
      if((c.types.includes('creature')&&(c.toughness<=0||(!c.keywords.includes('indestructible')&&((o.damage??0)>=c.toughness||o.deathtouchDamage))))||
         (c.types.includes('planeswalker')&&(o.counters?.loyalty??0)<=0))moves.set(o.id,{ref:r,to:'graveyard'});
      if(c.legendary){const k=JSON.stringify([c.controller,c.name]);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(o);}
      const n=Math.min(o.counters?.plus??0,o.counters?.minus??0);
      if(n>0){o.counters.plus-=n;o.counters.minus-=n;changed=true;}
    }
    for(const p of ordered(s))for(const group of groups.values()){
      if(group.length<2||characteristics(s,group[0]).controller!==p||losers.includes(p))continue;
      const keep=choice(ctx,p,'legend-rule',group.map(reference));
      for(const o of group)if(!refEqual(reference(o),keep))moves.set(o.id,{ref:reference(o),to:'graveyard'});
    }
    // A commander must have entered graveyard/exile since the last SBA check.
    for(const o of Object.values(s.objects)){
      if(o.commandEligible&&live(s).includes(o.owner)&&!losers.includes(o.owner)){
        delete o.commandEligible;changed=true;
        if(choice(ctx,o.owner,'commander-state-action',[false,true]))moves.set(o.id,{ref:reference(o),to:'command'});
      }
    }
    if(losers.length){losePlayers(s,losers,ctx);changed=true;}
    const valid=[...moves.values()].filter(m=>dereference(s,m.ref));
    if(valid.length){moveBatch(s,valid,ctx);changed=true;}
    if(!changed)break;
  }
}
function checkpoint(s,ctx,p=s.active) {
  stabilize(s,ctx);
  if(s.result)return;
  const pending=s.pending;s.pending=[];
  for(const controller of ordered(s)){
    for(const item of orderItems(ctx,controller,'trigger-order',pending.filter(x=>x.controller===controller))){
      const choices=item.specs.map(spec=>targets(s,spec,controller));
      if(choices.some(a=>!a.length))continue;
      item.targets=choices.map(a=>choice(ctx,controller,'trigger-target',a));
      s.stack.push(item);
    }
  }
  s.priority=live(s).includes(p)?p:s.active;s.passes=[];
}
function canPay(s,p,c,x) {
  const pool=player(s,p).mana;
  return colors.every(k=>pool[k]>=c[k])&&colors.reduce((sum,k)=>sum+pool[k]-c[k],0)>=c.generic+c.X*x;
}
function pay(s,p,c,x,allocation) {
  const pool=player(s,p).mana;check(canPay(s,p,c,x),'Insufficient mana');
  const rest=c.generic+c.X*x;
  let a=allocation;
  if(a===undefined){
    a={};let remaining=rest;
    for(const k of ['C','W','U','B','R','G']){a[k]=Math.min(pool[k]-c[k],remaining);remaining-=a[k];}
  }
  check(a&&Object.keys(a).every(k=>colors.includes(k))&&colors.every(k=>integer(a[k]??0)&&pool[k]>=c[k]+(a[k]??0))&&
    colors.reduce((n,k)=>n+(a[k]??0),0)===rest,'Invalid mana allocation');
  for(const k of colors)pool[k]-=c[k]+(a[k]??0);
}
function timing(s,p){return s.active===p&&['main1','main2'].includes(s.step)&&!s.stack.length;}
function requirePriority(s,p){player(s,p);check(!s.result&&s.priority===p,'No priority');}
function tapCost(s,o,p) {
  const c=characteristics(s,o);
  check(c.controller===p&&!o.tapped&&!o.phased,'Cannot tap');
  check(!c.types.includes('creature')||o.controlSince<s.players[p].lastTurn||c.keywords.includes('haste'),'Summoning sickness');
  o.tapped=true;
}
function action(s,p,cmd,ctx) {
  requirePriority(s,p);
  const o=get(s,cmd.source),d=def(s,o);
  if(cmd.kind==='land'){
    check(o.owner===p&&o.zone==='hand'&&d.types.includes('land')&&timing(s,p)&&s.players[p].lands<1,'Illegal land play');
    s.players[p].lands++;moveBatch(s,[{ref:cmd.source,to:'bf',controller:p}],ctx);checkpoint(s,ctx,p);return;
  }
  if(cmd.kind==='cast'){
    check(o.owner===p&&['hand','command'].includes(o.zone)&&!d.types.includes('land'),'Cannot cast from zone');
    check(o.zone!=='command'||o.commander,'Not a commander');
    check(d.types.includes('instant')||d.keywords?.includes('flash')||timing(s,p),'Illegal spell timing');
    const specs=d.targets??[],selected=selectedTargets(s,specs,p,cmd.targets??[]);
    const x=cmd.x??0,c=manaCost(d.cost);
    check(integer(x)&&(c.X||x===0),'Invalid X');
    if(o.zone==='command')c.generic+=2*(o.commandCasts??0);
    pay(s,p,c,x,cmd.payment);
    if(o.zone==='command')o.commandCasts=(o.commandCasts??0)+1;
    const [cardRef]=moveBatch(s,[{ref:cmd.source,to:'stack',controller:p}],ctx);
    check(cardRef&&get(s,cardRef).zone==='stack','Spell did not reach stack');
    s.stack.push({id:s.nextId++,kind:'spell',controller:p,cardRef,sourceLki:snapshot(s,o),specs,targets:selected,x,ops:d.ops??[]});
    recordBatch(s,[{kind:'cast',player:p,object:cardRef,types:d.types}],battlefield(s).map(o=>snapshot(s,o)));
  }else{
    check(o.zone==='bf'&&!o.phased&&characteristics(s,o).controller===p,'Cannot activate');
    const a=characteristics(s,o).abilities[cmd.ability];
    check(a,'Unknown ability');
    check(!a.sorcery||timing(s,p),'Sorcery timing required');
    const specs=a.targets??[],selected=selectedTargets(s,specs,p,cmd.targets??[]);
    const sourceLki=snapshot(s,o);
    const c=manaCost(a.cost),x=cmd.x??0;check(integer(x)&&(c.X||x===0),'Invalid X');
    pay(s,p,c,x,cmd.payment);
    if(a.tap)tapCost(s,o,p);
    if(a.sacrifice)moveBatch(s,[{ref:cmd.source,to:'graveyard'}],ctx);
    const item={id:s.nextId++,kind:'activated',controller:p,sourceLki,source:cmd.source,specs,targets:selected,x,ops:a.ops??[]};
    if(a.mana){check(!specs.length&&item.ops.every(x=>x.op==='mana'),'Invalid mana ability');resolveOps(s,item,[],ctx);}
    else s.stack.push(item);
  }
  checkpoint(s,ctx,p);
}
function resolveOne(s,ctx) {
  const item=s.stack.pop();
  const selected=item.targets.map((t,i)=>legalTarget(s,t,item.specs[i],item.controller)?t:null);
  const fizzles=selected.length>0&&selected.every(t=>!t);
  if(!fizzles)resolveOps(s,item,selected,ctx);
  if(item.cardRef&&dereference(s,item.cardRef)){
    const o=get(s,item.cardRef),d=def(s,o);
    const permanent=!d.types.some(t=>['instant','sorcery'].includes(t));
    moveBatch(s,[{ref:item.cardRef,to:!fizzles&&permanent?'bf':item.destination??'graveyard',controller:item.controller}],ctx);
  }
  emit(s,{kind:fizzles?'all-targets-illegal':'resolve',stack:item.id});checkpoint(s,ctx);
}
function attackers(s,p,cmd,ctx) {
  requirePriority(s,p);check(s.step==='attackers'&&s.active===p&&!s.combat.attackersDeclared,'Not declaring attackers');
  check(Array.isArray(cmd.attackers),'Invalid attackers');const seen=new Set();
  for(const a of cmd.attackers){
    const o=get(s,a.ref),c=characteristics(s,o);
    check(!seen.has(o.id)&&o.zone==='bf'&&!o.phased&&!o.tapped&&c.controller===p&&c.types.includes('creature')&&
      !c.keywords.includes('defender')&&a.defender!==p&&live(s).includes(a.defender),'Illegal attacker');
    check(c.keywords.includes('haste')||o.controlSince<s.players[p].lastTurn,'Summoning sickness');
    seen.add(o.id);if(!c.keywords.includes('vigilance'))o.tapped=true;
  }
  s.combat.attackers=cmd.attackers.map(a=>({...clone(a),blocked:false,blockers:[]}));
  s.combat.attackersDeclared=true;
  recordBatch(s,s.combat.attackers.map(a=>({kind:'attack',object:a.ref,player:p,types:['creature']})),battlefield(s).map(o=>snapshot(s,o)));
  checkpoint(s,ctx,p);
}
function blockers(s,p,cmd,ctx) {
  player(s,p);check(s.step==='blockers'&&s.combat.defenders[s.combat.defenderIndex]===p,'Not declaring blockers');
  const seen=new Set();check(Array.isArray(cmd.blocks),'Invalid blocks');
  for(const b of cmd.blocks){
    const a=s.combat.attackers.find(x=>refEqual(x.ref,b.attacker)&&x.defender===p);
    const o=get(s,b.ref),c=characteristics(s,o);
    check(a&&dereference(s,a.ref)&&!seen.has(o.id)&&o.zone==='bf'&&!o.phased&&!o.tapped&&c.controller===p&&c.types.includes('creature'),'Illegal blocker');
    const ac=characteristics(s,get(s,a.ref));
    check(!ac.keywords.includes('flying')||c.keywords.includes('flying')||c.keywords.includes('reach'),'Flying restriction');
    seen.add(o.id);a.blockers.push(b.ref);a.blocked=true;
  }
  for(const a of s.combat.attackers.filter(a=>a.defender===p&&a.blocked)){
    check(!characteristics(s,get(s,a.ref)).keywords.includes('menace')||a.blockers.length>=2,'Menace requires two blockers');
  }
  s.combat.defenderIndex++;
  if(s.combat.defenderIndex===s.combat.defenders.length)checkpoint(s,ctx);
}
function aliveCombat(s,r){const o=dereference(s,r);return o&&o.zone==='bf'&&!o.phased&&characteristics(s,o).types.includes('creature')?o:null;}
function combatDamage(s,ctx,first) {
  const hits=[];
  const strike=(o)=>{const c=characteristics(s,o);return first?(c.keywords.includes('first strike')||c.keywords.includes('double strike')):
    (!s.combat.firstStrikers.includes(key(o))||c.keywords.includes('double strike'));};
  const participants=s.combat.attackers.flatMap(a=>[a.ref,...a.blockers]).map(r=>aliveCombat(s,r)).filter(Boolean);
  if(first)s.combat.firstStrikers=participants.filter(strike).map(key);
  for(const a of s.combat.attackers){
    const o=aliveCombat(s,a.ref);if(!o||!live(s).includes(a.defender))continue;
    const c=snapshot(s,o),bs=a.blockers.map(r=>aliveCombat(s,r)).filter(Boolean);
    if(strike(o)){
      const n=Math.max(0,c.power);
      if(!a.blocked)hits.push({source:c,target:{player:a.defender},amount:n,combat:true});
      else {
        const trample=c.keywords.includes('trample');
        // Allocate damage one point at a time; lethal need not follow blocker ordering.
        let left=n;const assigned=bs.map(()=>0);
        const lethal=bs.map(b=>Math.max(0,Math.min(c.keywords.includes('deathtouch')?1:Infinity,characteristics(s,b).toughness-(b.damage??0))));
        let playerDamage=0;
        while(left>0&&(bs.length||trample)){
          const options=bs.map(b=>b.id);
          if(trample&&assigned.every((v,i)=>v>=lethal[i]))options.push('defender');
          const dest=choice(ctx,c.controller,'combat-damage-point',options);
          if(dest==='defender'){playerDamage++;}else assigned[bs.findIndex(b=>b.id===dest)]++;
          left--;
        }
        // A trample assignment to the defender is legal only after lethal is assigned to all blockers.
        bs.forEach((b,i)=>hits.push({source:c,target:reference(b),amount:assigned[i],combat:true}));
        if(playerDamage)hits.push({source:c,target:{player:a.defender},amount:playerDamage,combat:true});
      }
    }
    for(const b of bs)if(strike(b))hits.push({source:snapshot(s,b),target:reference(o),amount:Math.max(0,characteristics(s,b).power),combat:true});
  }
  damageBatch(s,hits,ctx);
}
function advance(s,ctx) {
  for(const p of live(s))s.players[p].mana=emptyMana();
  let i=steps.indexOf(s.step)+1;
  if(i===steps.length){s.active=next(s,s.active);s.turn++;i=0;}
  s.step=steps[i];s.priority=null;
  switch(s.step){
    case 'untap':
      s.players[s.active].lastTurn=s.turn;s.players[s.active].lands=0;
      for(const o of battlefield(s))if(characteristics(s,o).controller===s.active)o.tapped=false;
      return advance(s,ctx);
    case 'draw':
      if(!(s.seats.length===2&&s.turn===1))draw(s,s.active,1,ctx);break;
    case 'beginCombat':s.combat={attackers:[],attackersDeclared:false,defenders:[],defenderIndex:0,firstStrikers:[]};break;
    case 'attackers':s.priority=s.active;return;
    case 'blockers':
      if(!s.combat.attackers.length){s.step='endCombat';checkpoint(s,ctx);return;}
      s.combat.defenders=ordered(s).filter(p=>s.combat.attackers.some(a=>a.defender===p));
      if(s.combat.defenders.length)return;
      break;
    case 'firstDamage':
      if(!s.combat.attackers.flatMap(a=>[a.ref,...a.blockers]).some(r=>{
        const o=aliveCombat(s,r);return o&&characteristics(s,o).keywords.some(k=>['first strike','double strike'].includes(k));
      }))return advance(s,ctx);
      combatDamage(s,ctx,true);break;
    case 'damage':combatDamage(s,ctx,false);break;
    case 'cleanup':{
      const hand=objects(s,'hand').filter(o=>o.owner===s.active);
      while(hand.length>7){const r=choice(ctx,s.active,'discard-to-hand-size',hand.map(reference));hand.splice(hand.findIndex(o=>o.id===r.id),1);moveBatch(s,[{ref:r,to:'graveyard'}],ctx);}
      for(const o of battlefield(s)){delete o.damage;delete o.deathtouchDamage;}
      s.effects=s.effects.filter(e=>e.untilTurn!==s.turn);
      stabilize(s,ctx);if(s.result)return;
      if(s.pending.length){checkpoint(s,ctx);return;}
      return advance(s,ctx);
    }
  }
  recordBatch(s,[{kind:'step:'+s.step,player:s.active}],battlefield(s).map(o=>snapshot(s,o)));
  checkpoint(s,ctx);
}
function dispatch(s,p,cmd,ctx) {
  player(s,p);
  check(!s.result,'Game ended');
  switch(cmd.kind){
    case 'cast':case 'activate':case 'land':
      check(!(s.step==='attackers'&&!s.combat.attackersDeclared),'Declare attackers first');
      action(s,p,cmd,ctx);break;
    case 'attackers':attackers(s,p,cmd,ctx);break;
    case 'blockers':blockers(s,p,cmd,ctx);break;
    case 'concede':
      losePlayers(s,[p],ctx);if(!s.result&&s.priority!==null)checkpoint(s,ctx,s.priority);break;
    case 'pass':
      requirePriority(s,p);
      check(!(s.step==='attackers'&&!s.combat.attackersDeclared),'Declare attackers first');
      s.passes.push(p);
      if(s.passes.length<live(s).length){s.priority=next(s,p);break;}
      s.passes=[];s.priority=null;
      if(s.stack.length)resolveOne(s,ctx);
      else if(s.step==='cleanup'){s.step='end';advance(s,ctx);}
      else advance(s,ctx);
      break;
    default:fail('Unknown command');
  }
}
const supportedOps=new Set(['draw','gain','lose','damage','counter','move','destroy','destroyAll','counters','mana','mayPay','temporary']);
function verifyOps(ops){
  check(Array.isArray(ops),'Invalid operations');
  for(const o of ops){
    check(supportedOps.has(o.op),'Unsupported semantic operation: '+o.op);
    if(o.otherwise)verifyOps(o.otherwise);
    if(o.amount!==undefined)check(o.amount==='X'||integer(o.amount),'Invalid amount');
  }
}
export function validateCommanderDeck(deck,definitions) {
  const errors=[];
  if(!Array.isArray(deck.cards)||!Array.isArray(deck.commanders))return ['Invalid deck shape'];
  if(deck.cards.length+deck.commanders.length!==100)errors.push('Commander deck must contain 100 cards including commander');
  if(deck.commanders.length!==1)errors.push('Only single commanders supported');
  const commander=Object.hasOwn(definitions,deck.commanders[0])?definitions[deck.commanders[0]]:null;
  if(!commander||!(commander.legendary&&commander.types?.includes('creature')||commander.canCommand))errors.push('Ineligible commander');
  const allowed=new Set(commander?.identity??[]),counts=new Map();
  for(const id of [...deck.cards,...deck.commanders]){
    const d=Object.hasOwn(definitions,id)?definitions[id]:null;
    if(!d){errors.push('Unsupported card: '+id);continue;}
    if(d.banned)errors.push('Banned card: '+d.name);
    if(!Array.isArray(d.identity)||d.identity.some(c=>!allowed.has(c)))errors.push('Color identity: '+d.name);
    const name=d.name;counts.set(name,(counts.get(name)??0)+1);
    if(counts.get(name)>(d.basic?Infinity:d.deckLimit??1))errors.push('Singleton: '+name);
  }
  return [...new Set(errors)];
}
export function createGame({seats,definitions,decks,seed=1,commander=true,openingHand=7,startingLife=commander?40:20}) {
  check(Array.isArray(seats)&&seats.length>=2&&seats.length<=4&&seats.every(p=>Number.isSafeInteger(p)&&p>=0),'Expected 2–4 numeric seats');
  check(integer(seed)&&seed>0&&seed<=0xffffffff&&integer(openingHand)&&integer(startingLife)&&startingLife>0,'Invalid game configuration');
  check(definitions&&typeof definitions==='object'&&decks,'Missing definitions/decks');
  const s=newRulesState(seats);Object.assign(s,{schema:1,revision:0,definitions:clone(definitions),players:{},turn:1,step:'untap',
    rng:seed,clock:0,eventSeq:0,events:[],effects:[],history:[],waiting:null,result:null,combat:null});
  for(const [id,d] of Object.entries(s.definitions)){
    check(typeof d.name==='string'&&Array.isArray(d.types)&&d.types.length&&d.reviewed===true,'Unreviewed definition: '+id);
    check(!d.types.some(t=>['battle','aura'].includes(t)),'Unsupported card type: '+id);
    manaCost(d.cost);verifyOps(d.ops??[]);
    for(const a of [...(d.abilities??[]),...(d.triggers??[])])verifyOps(a.ops??[]);
  }
  const ctx={answers:[],cursor:0,revision:0};
  for(const p of seats){
    const deck=decks[p];check(deck&&Array.isArray(deck.cards)&&Array.isArray(deck.commanders??[]),'Missing deck');
    if(commander){const errors=validateCommanderDeck(deck,s.definitions);check(!errors.length,errors.join('; '));}
    s.players[p]={id:p,life:startingLife,poison:0,mana:emptyMana(),library:[],commanderDamage:{},lands:0,lastTurn:0,lost:false};
    for(const [zone,ids] of [['library',deck.cards],['command',deck.commanders??[]]])for(const card of ids){
      check(Object.hasOwn(s.definitions,card),'Unsupported card: '+card);
      const ref=createObject(s,{card,owner:p,controller:p,zone,commander:zone==='command',commandCasts:0,timestamp:++s.clock});
      if(zone==='library')s.players[p].library.push(ref.id);
    }
    shuffle(s,s.players[p].library);
    check(s.players[p].library.length>=openingHand,'Opening hand exceeds library');
  }
  for(const p of seats)draw(s,p,openingHand,ctx);
  advance(s,ctx);return s;
}
export function submit(state,p,command) {
  check(state.schema===1&&command&&typeof command==='object','Invalid command');
  check(command.revision===state.revision,'Stale revision');
  let original=state,actor=p,action=clone(command),answers=[];
  if(state.waiting){
    const w=state.waiting;
    check(command.kind==='choose'&&p===w.request.player&&command.id===w.request.id&&w.request.options.some(o=>same(o,command.value)),'Invalid decision');
    actor=w.actor;action=w.command;answers=[...w.answers,{player:p,value:clone(command.value)}];
  }else check(command.kind!=='choose','No pending decision');
  const draft=clone(original);draft.waiting=null;
  const ctx={answers,cursor:0,revision:state.revision};
  try{
    dispatch(draft,actor,action,ctx);
    check(ctx.cursor===answers.length,'Unused decision answers');
    draft.revision++;
    draft.history.push({player:actor,command:action,answers});
    return draft;
  }catch(e){
    if(!(e instanceof Decision))throw e;
    const waiting=clone(original);waiting.revision++;
    waiting.waiting={actor,command:action,answers,request:e.request};
    return waiting;
  }
}
export function viewFor(s,p) {
  check(s.seats.includes(p),'Invalid seat');
  const visible=o=>publicZones.includes(o.zone)||(o.owner===p&&o.zone==='hand');
  const players=s.seats.map(id=>{const x=s.players[id];return {id,life:x.life,poison:x.poison,lost:x.lost,mana:clone(x.mana),commanderDamage:clone(x.commanderDamage),
    libraryCount:x.library.length,handCount:objects(s,'hand').filter(o=>o.owner===id).length};});
  const decision=s.waiting?.request;
  return clone({revision:s.revision,turn:s.turn,step:s.step,active:s.active,priority:s.waiting?null:s.priority,result:s.result,players,
    objects:Object.values(s.objects).filter(visible).map(o=>({ref:reference(o),owner:o.owner,controller:o.controller,zone:o.zone,card:o.card,
      commander:o.commander,commandCasts:o.commandCasts,tapped:!!o.tapped,damage:o.damage??0,counters:o.counters??{},characteristics:characteristics(s,o)})),
    stack:s.stack.map(x=>({id:x.id,kind:x.kind,controller:x.controller,cardRef:x.cardRef??null,targets:x.targets})),
    decision:decision?.player===p?decision:null,waitingFor:decision?.player??null,combat:s.combat});
}
// Enumerates structural actions, not a promise that a complete cast/payment is legal.
// The caller supplies targets, mana allocation, X, and declarations to submit().
export function actionCandidates(s,p) {
  if(s.result||s.waiting||s.players[p]?.lost)return [];
  if(s.step==='blockers'&&s.combat.defenders[s.combat.defenderIndex]===p)return [{kind:'blockers'}];
  if(s.priority!==p)return [];
  if(s.step==='attackers'&&!s.combat.attackersDeclared)return [{kind:'attackers'}];
  const out=[{kind:'pass'}];
  for(const o of Object.values(s.objects)){
    const d=def(s,o);
    if(o.owner===p&&o.zone==='hand'&&d.types.includes('land')&&timing(s,p)&&s.players[p].lands<1)out.push({kind:'land',source:reference(o)});
    if(o.owner===p&&['hand','command'].includes(o.zone)&&!d.types.includes('land')&&(d.types.includes('instant')||d.keywords?.includes('flash')||timing(s,p))){
      const c=manaCost(d.cost);if(o.zone==='command')c.generic+=2*(o.commandCasts??0);
      const options=(d.targets??[]).map(spec=>targets(s,spec,p));
      if(canPay(s,p,c,0)&&options.every(a=>a.length))out.push({kind:'cast',source:reference(o),targetOptions:options});
    }
    if(o.zone==='bf'&&!o.phased&&characteristics(s,o).controller===p)characteristics(s,o).abilities.forEach((a,i)=>{
      const options=(a.targets??[]).map(spec=>targets(s,spec,p));
      if((!a.sorcery||timing(s,p))&&canPay(s,p,manaCost(a.cost),0)&&options.every(x=>x.length)&&(!a.tap||!o.tapped))out.push({kind:'activate',source:reference(o),ability:i,targetOptions:options});
    });
  }
  return out;
}
export function replay(config,history) {
  let s=createGame(config);
  for(const entry of history){
    s=submit(s,entry.player,{...entry.command,revision:s.revision});
    for(const a of entry.answers){
      check(s.waiting,'Unexpected replay decision');
      s=submit(s,a.player,{kind:'choose',id:s.waiting.request.id,value:a.value,revision:s.revision});
    }
    check(!s.waiting,'Incomplete replay');
  }
  return s;
}
