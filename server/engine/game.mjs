// Authoritative, serializable command engine for explicitly implemented cards.
// Oracle strings are never executed. Unsupported definitions fail closed.
import {newRulesState,createObject,reference,dereference,changeZone,commitAction,queueTrigger,putTriggers,grantPriority,passPriority,resolveTop,counter,basicSbas,apnap} from './core.mjs';

const clone = v => structuredClone(v);
const colors = ['W','U','B','R','G','C'];
const main = s => ['main','postcombat'].includes(s.step);
const live = (s,p) => s.seats.includes(p);
const fail = message => { throw new Error(message); };
const nat = n => Number.isSafeInteger(n) && n>=0;
const same = (a,b) => a?.id===b?.id && a?.generation===b?.generation;
const objects = (s,zone) => Object.values(s.objects).filter(o=>o.zone===zone);
const permanent = o => o.types.some(t=>['creature','artifact','enchantment','planeswalker','land','battle'].includes(t));
const steps = ['upkeep','draw','main','beginCombat','attackers','blockers','damage','endCombat','postcombat','end','cleanup'];
const keywords = new Set(['flash','haste','vigilance','flying','reach','first strike','double strike','trample','deathtouch','lifelink','indestructible','menace','defender','hexproof','shroud']);
const operations = new Set(['draw','gain','lose','damage','destroy','exile','bounce','counter','addCounters','tap','untap','destroyAll','mana']);
const conditions = new Set(['player','creature','permanent','spell','ability']);
const events = new Set(['cast','enter','dies','leave','draw','attack']);
const manaPool = () => Object.fromEntries(colors.map(c=>[c,0]));
function validateCost(cost={}) {
  if (!nat(cost.generic??0)||!Array.isArray(cost.pips??[])||(cost.pips??[]).some(p=>!Array.isArray(p)||!p.length||p.some(c=>!colors.includes(c)))) fail('Unsupported mana cost');
}
function validateEffect(e,slots) {
  if (!e || !operations.has(e.kind)) fail('Unsupported effect');
  if (['draw','gain','lose','damage','addCounters','mana'].includes(e.kind)&&!nat(e.n)) fail('Invalid effect amount');
  if (e.target!=null && (!nat(e.target)||e.target>=slots)) fail('Invalid target slot');
  if (['destroy','exile','bounce','counter','addCounters','tap','untap','damage'].includes(e.kind)&&e.target==null) fail('Missing effect target');
  if(e.kind==='mana'&&!colors.includes(e.color))fail('Unsupported mana color');
  if(e.kind==='addCounters'&&!['plus','minus','loyalty'].includes(e.counter))fail('Unsupported counter');
}
function validateAbility(a) {
  if(!a||!Array.isArray(a.effects??[])||!Array.isArray(a.targets??[])||(a.targets??[]).some(t=>!conditions.has(t.kind)))fail('Unsupported target/ability');
  for(const e of a.effects??[]){
    validateEffect(e,(a.targets??[]).length);
    if(e.target!=null){
      const k=a.targets[e.target].kind;
      if(['draw','gain','lose'].includes(e.kind)&&k!=='player')fail('Effect requires player target');
      if(['destroy','exile','bounce','addCounters','tap','untap'].includes(e.kind)&&!['creature','permanent'].includes(k))fail('Effect requires permanent target');
      if(e.kind==='damage'&&!['player','creature','permanent'].includes(k))fail('Invalid damage target');
      if(e.kind==='counter'&&!['spell','ability'].includes(k))fail('Counter requires stack target');
    }
  }
  validateCost(a.cost);
}
function validateDefinition(d) {
  if(!d||d.implemented!==true||typeof d.name!=='string'||!d.name||!Array.isArray(d.types)||!d.types.length)fail('Card has no reviewed implementation');
  if(d.types.some(t=>!['creature','artifact','enchantment','planeswalker','land','instant','sorcery'].includes(t)))fail('Unsupported card type');
  if(d.types.includes('creature')&&(!Number.isSafeInteger(d.power)||!Number.isSafeInteger(d.toughness)))fail('Unsupported power/toughness');
  if(d.types.includes('planeswalker')&&!nat(d.loyalty))fail('Unsupported loyalty');
  if((d.keywords??[]).some(k=>!keywords.has(k)))fail('Unsupported keyword');
  if(d.types.includes('enchantment')&&d.aura)fail('Aura not implemented');
  validateAbility(d);
  if(d.types.some(t=>['creature','artifact','enchantment','planeswalker','land'].includes(t))&&((d.effects??[]).length||(d.targets??[]).length))fail('Permanent spell effects must use implemented triggers or abilities');
  for(const a of d.abilities??[]) {
    validateAbility(a);
    if(a.mana&&((a.targets??[]).length||!(a.effects??[]).length||a.effects.some(e=>e.kind!=='mana')))fail('Invalid mana ability');
  }
  for(const t of d.triggers??[]) {
    validateAbility(t);
    if(!events.has(t.event)||(t.targets??[]).length)fail('Unsupported trigger');
  }
}
function shuffle(s,a) {
  for(let i=a.length-1;i>0;i--) {
    let x=s.random>>>0;x^=x<<13;x^=x>>>17;x^=x<<5;s.random=x>>>0;
    const j=s.random%(i+1);[a[i],a[j]]=[a[j],a[i]];
  }
}
export function createGame({seats, decks, definitions, seed=1, active=seats[0], startingHand=7, startingLife=40, shuffleDecks=true}) {
  if(seats.length<2||seats.length>4||seats.some(p=>!Number.isInteger(p)||p<0||p>3)||!nat(startingHand)||!nat(startingLife)||!Number.isSafeInteger(seed))fail('Invalid game settings');
  const s=newRulesState(seats,active);
  Object.assign(s,{definitions:clone(definitions),players:{},libraries:{},turn:1,step:'upkeep',random:(seed>>>0)||1,version:0,log:[],events:[],resume:active,over:false,winner:null,combat:null});
  for(const p of seats) {
    s.players[p]={id:p,life:startingLife,poison:0,mana:manaPool(),commanderDamage:{},commanderCasts:{},lands:0,drewEmpty:false};
    s.libraries[p]=[];
    const deck=decks[p];
    if(!deck||!Array.isArray(deck.library)||!Array.isArray(deck.commanders??[]))fail('Invalid deck');
    for(const [zone,names] of [['library',deck.library],['command',deck.commanders??[]]])for(const key of names) {
      if(!Object.hasOwn(definitions,key))fail('Unknown card '+key);
      const d=definitions[key];validateDefinition(d);
      const ref=createObject(s,{key,name:d.name,owner:p,controller:p,zone,commander:zone==='command',types:[...d.types],legendary:!!d.legendary,power:d.power??0,toughness:d.toughness??0,keywords:[...(d.keywords??[])]});
      if(zone==='library')s.libraries[p].push(ref.id);
    }
    if(shuffleDecks)shuffle(s,s.libraries[p]);
    for(let i=0;i<startingHand&&s.libraries[p].length;i++) {
      const o=s.objects[s.libraries[p].shift()];changeZone(s,reference(o),'hand');
    }
  }
  grantPriority(s,active);return s;
}
function def(s,o){return s.definitions[o.key];}
function snapshot(s){return objects(s,'battlefield').map(clone);}
function event(s,e,before=[]) {
  // Public event journal contains only object references for public zones.
  s.events.push({kind:e.kind,player:e.player??null,object:e.public===false?null:e.object??null});
  const candidates=e.kind==='dies'||e.kind==='leave'?before:snapshot(s);
  for(const source of candidates)for(const t of def(s,source).triggers??[]) {
    if(t.event!==e.kind||!live(s,source.controller))continue;
    if(t.self&&!same(reference(source),e.object))continue;
    if(t.other&&same(reference(source),e.object))continue;
    if(t.controller==='you'&&e.player!==source.controller)continue;
    if(t.controller==='opponent'&&e.player===source.controller)continue;
    queueTrigger(s,{kind:'triggered',controller:source.controller,source:reference(source),name:source.name,effects:clone(t.effects??[]),targets:[]});
  }
}
function moveBatch(s,moves) {
  const before=snapshot(s), moved=[];
  const seen=new Set();
  for(const m of moves) {
    const o=dereference(s,m.ref);if(!o||seen.has(o.id)||o.zone===m.to)continue;seen.add(o.id);
    if(o.zone==='library')s.libraries[o.owner]=s.libraries[o.owner].filter(id=>id!==o.id);
    const from=o.zone,controller=o.controller;
    const {object,lastKnown}=changeZone(s,m.ref,m.to,{controller:m.controller});
    if(m.to==='library') {
      if(m.bottom)s.libraries[o.owner].push(o.id);else s.libraries[o.owner].unshift(o.id);
    }
    if(m.to==='battlefield') {
      o.sick=true;o.tapped=!!def(s,o).entersTapped;o.damage=0;
      o.counters=o.types.includes('planeswalker')?{loyalty:def(s,o).loyalty}:{};
    }
    o.commandPending=o.commander&&['graveyard','exile'].includes(m.to);
    moved.push({from,to:m.to,object,lastKnown,controller});
  }
  for(const m of moved) {
    if(m.from==='battlefield') {
      event(s,{kind:'leave',object:reference(m.lastKnown),player:m.controller},before);
      if(m.to==='graveyard'&&m.lastKnown.types.includes('creature'))event(s,{kind:'dies',object:reference(m.lastKnown),player:m.controller},before);
    }
    if(m.to==='battlefield')event(s,{kind:'enter',object:m.object,player:s.objects[m.object.id].controller});
  }
}
function move(s,o,to,opts={}) {
  if(o.commander&&['hand','library'].includes(to)) {
    // Choice belongs to owner and is made before the move. Effects which need
    // this choice are rejected unless it was explicitly specified.
    if(typeof opts.command!=='boolean')fail('Commander replacement choice required');
    if(opts.command)to='command';
  }
  moveBatch(s,[{ref:reference(o),to,...opts}]);
}
function draw(s,p,n) {
  for(let i=0;i<n;i++) {
    const id=s.libraries[p][0];if(id==null){s.players[p].drewEmpty=true;continue;}
    moveBatch(s,[{ref:reference(s.objects[id]),to:'hand'}]);
    event(s,{kind:'draw',player:p,public:false});
  }
}
function power(o){return o.power+(o.counters?.plus??0)-(o.counters?.minus??0);}
function toughness(o){return o.toughness+(o.counters?.plus??0)-(o.counters?.minus??0);}
function legal(s,t,spec,controller) {
  if(!t||!spec)return false;
  if(spec.kind==='player')return t.kind==='player'&&live(s,t.player)&&(!spec.opponent||t.player!==controller);
  if(['spell','ability'].includes(spec.kind)) {
    const a=s.stack.find(x=>x.id===t.id);
    return t.kind==='stack'&&!!a&&(spec.kind==='spell'?a.kind==='spell'||a.kind==='copy':a.kind==='activated'||a.kind==='triggered');
  }
  const o=t.kind==='object'?dereference(s,t):null;
  if(!o||o.zone!=='battlefield'||o.phased||o.keywords.includes('shroud')||(o.keywords.includes('hexproof')&&o.controller!==controller))return false;
  return (spec.kind==='permanent'||o.types.includes('creature'))&&(!spec.opponent||o.controller!==controller)&&(!spec.you||o.controller===controller);
}
function targets(s,a,p,chosen) {
  if(!Array.isArray(chosen)||chosen.length!==(a.targets??[]).length||chosen.some((t,i)=>!legal(s,t,a.targets[i],p)))fail('Illegal target');
  return clone(chosen);
}
function pay(s,p,cost={},payment=[],tax=0) {
  validateCost(cost);if(!Array.isArray(payment)||payment.length!==(cost.pips??[]).length+(cost.generic??0)+tax)fail('Unpaid mana cost');
  const pool=s.players[p].mana;
  for(const [i,c] of payment.entries()) {
    if(!colors.includes(c)||pool[c]<=0||(i<(cost.pips??[]).length&&!cost.pips[i].includes(c)))fail('Illegal mana payment');
    pool[c]--;
  }
}
function damage(s,target,n,source,combat=false) {
  if(!n)return;
  if(target.kind==='player') {
    const p=s.players[target.player];p.life-=n;
    if(combat&&source?.commander)p.commanderDamage[source.id]=(p.commanderDamage[source.id]??0)+n;
  } else {
    const o=dereference(s,target);if(!o)return;
    if(o.types.includes('planeswalker'))o.counters.loyalty-=n;
    if(o.types.includes('creature')){o.damage=(o.damage??0)+n;if(source?.keywords.includes('deathtouch'))o.deathtouchDamage=true;}
  }
  if(source?.keywords.includes('lifelink')&&live(s,source.controller))s.players[source.controller].life+=n;
}
function dispose(s,item) {
  const o=dereference(s,item.source);
  if(item.kind==='spell'&&o?.zone==='stack')move(s,o,item.exileOnLeave?'exile':'graveyard');
}
function effects(s,item,chosen,choices={}) {
  const p=item.controller,source=dereference(s,item.source)??item.lastKnown;
  for(const e of item.effects??[]) {
    const t=e.target==null?null:chosen[e.target];
    if(e.target!=null&&!t)continue;
    const o=t?.kind==='object'?dereference(s,t):null;
    const player=t?.kind==='player'?t.player:p;
    switch(e.kind) {
      case 'draw':draw(s,player,e.n);break;
      case 'gain':s.players[player].life+=e.n;break;
      case 'lose':s.players[player].life-=e.n;break;
      case 'damage':damage(s,t,e.n,source);break;
      case 'destroy':if(o&&!o.keywords.includes('indestructible'))move(s,o,'graveyard');break;
      case 'exile':if(o)move(s,o,'exile');break;
      case 'bounce':if(o)move(s,o,'hand',{command:choices[o.id]});break;
      case 'counter':{const a=counter(s,t.id);if(a)dispose(s,a);break;}
      case 'addCounters':if(o){o.counters??={};o.counters[e.counter]=(o.counters[e.counter]??0)+e.n;}break;
      case 'tap':if(o)o.tapped=true;break;
      case 'untap':if(o)o.tapped=false;break;
      case 'destroyAll':moveBatch(s,objects(s,'battlefield').filter(o=>o.types.includes('creature')&&!o.keywords.includes('indestructible')).map(o=>({ref:reference(o),to:'graveyard'})));break;
      case 'mana':s.players[p].mana[e.color]+=e.n;break;
      default:fail('Unsupported effect');
    }
  }
}
function leave(s,p) {
  const old=s.seats,idx=old.indexOf(p);s.seats=old.filter(x=>x!==p);
  s.players[p].lost=true;s.libraries[p]=[];
  for(const o of Object.values(s.objects))if(o.owner===p)delete s.objects[o.id];
  for(const a of s.stack)if(a.controller===p&&a.kind==='spell')delete s.objects[a.source?.id];
  s.stack=s.stack.filter(a=>a.controller!==p&&(!a.source||a.kind!=='spell'||dereference(s,a.source)));
  s.pending=s.pending.filter(a=>a.controller!==p);
  for(const o of objects(s,'battlefield'))if(o.controller===p)moveBatch(s,[{ref:reference(o),to:'exile'}]);
  s.passes=[];s.priority=null;s.ready=null;
  if(s.active===p)s.active=old.slice(idx+1).concat(old.slice(0,idx)).find(x=>live(s,x))??null;
  if(!live(s,s.resume))s.resume=s.active;
  s.log.push({kind:'leave-game',player:p});
}
function finish(s) {
  if(s.seats.length<=1){s.over=true;s.winner=s.seats[0]??null;s.decision=null;s.priority=null;return true;}return false;
}
function decision(s,kind,player,data) {
  s.priority=null;s.passes=[];s.decision={kind,player,...clone(data)};
}
function settle(s) {
  if(s.over||s.decision)return;
  s.priority=null;s.passes=[];
  for(;;) {
    const actions=basicSbas({players:s.seats.map(p=>s.players[p]),permanents:objects(s,'battlefield').map(o=>({...o,toughness:toughness(o),indestructible:o.keywords.includes('indestructible')}))});
    const losers=actions.filter(a=>a.kind==='lose');
    if(losers.length){for(const a of losers)leave(s,a.player);if(finish(s))return;continue;}
    const doomed=actions.filter(a=>a.kind==='graveyard'||a.kind==='destroy');
    const legends=actions.filter(a=>a.kind==='legend-choice');
    // Keep selections serializable until all legend choices from this snapshot are made.
    if(legends.length) {
      const a=apnap(s).map(p=>legends.find(x=>x.controller===p&&!s.legendKeeps?.some(k=>k.refs.every(r=>x.refs.some(v=>same(r,v)))&&k.refs.length===x.refs.length))).find(Boolean);
      if(a){decision(s,'legend',a.controller,{refs:a.refs});return;}
      for(const k of s.legendKeeps??[])for(const ref of k.refs)if(!same(ref,k.keep))doomed.push({ref,kind:'graveyard'});
      delete s.legendKeeps;
    }
    if(doomed.length)moveBatch(s,doomed.map(a=>({ref:a.ref,to:'graveyard'})));
    for(const a of actions.filter(a=>a.kind==='cancel-counters')) {
      const o=dereference(s,a.ref);if(o){o.counters.plus-=a.n;o.counters.minus-=a.n;}
    }
    if(doomed.length||actions.some(a=>a.kind==='cancel-counters'))continue;
    const commander=apnap(s).map(p=>Object.values(s.objects).find(o=>o.owner===p&&o.commandPending)).find(Boolean);
    if(commander){decision(s,'commander',commander.owner,{ref:reference(commander)});return;}
    break;
  }
  for(const p of apnap(s)) {
    const ids=s.pending.filter(t=>t.controller===p).map(t=>t.id);
    if(ids.length>1&&!s.triggerOrders?.[p]){decision(s,'trigger-order',p,{ids});return;}
  }
  if(s.pending.length)putTriggers(s,s.triggerOrders??{});
  delete s.triggerOrders;
  grantPriority(s,live(s,s.resume)?s.resume:s.active);
}
function stepDecision(s,kind,p,data={}){decision(s,kind,p,data);}
function advance(s) {
  for(const p of s.seats)s.players[p].mana=manaPool();
  const next=steps[steps.indexOf(s.step)+1];
  if(!next)fail('Invalid step');
  s.step=next;s.resume=s.active;
  if(next==='draw'&&!(s.turn===1&&s.seats.length===2))draw(s,s.active,1);
  if(next==='attackers'){s.combat={attackers:[],blocks:[],first:[]};stepDecision(s,'attackers',s.active);return;}
  if(next==='blockers'&&s.combat.attackers.length) {
    const defenders=apnap(s).filter(p=>s.combat.attackers.some(a=>a.defender===p));
    s.combat.defenders=defenders;stepDecision(s,'blockers',defenders[0]);return;
  }
  if(next==='damage'){beginDamage(s);return;}
  if(next==='cleanup') {
    const hand=objects(s,'hand').filter(o=>o.owner===s.active);
    if(hand.length>7){stepDecision(s,'discard',s.active,{count:hand.length-7});return;}
    cleanup(s);return;
  }
  settle(s);
}
function cleanup(s) {
  for(const o of objects(s,'battlefield')){o.damage=0;o.deathtouchDamage=false;}
  s.combat=null;s.active=s.seats[(s.seats.indexOf(s.active)+1)%s.seats.length];s.turn++;s.step='upkeep';s.resume=s.active;
  s.players[s.active].lands=0;
  for(const o of objects(s,'battlefield'))if(o.controller===s.active){o.tapped=false;o.sick=false;}
  settle(s);
}
function attacker(s,ref){return dereference(s,ref);}
function chooseAttackers(s,p,list) {
  if(!Array.isArray(list))fail('Invalid attackers');
  const used=new Set();
  for(const a of list) {
    const o=attacker(s,a.ref);
    if(!o||o.phased||o.zone!=='battlefield'||!o.types.includes('creature')||o.controller!==p||o.tapped||o.keywords.includes('defender')||(o.sick&&!o.keywords.includes('haste'))||!live(s,a.defender)||a.defender===p||used.has(o.id))fail('Illegal attacker');
    used.add(o.id);
  }
  s.combat.attackers=list.map(a=>({ref:clone(a.ref),defender:a.defender,blocked:false}));
  for(const a of s.combat.attackers){const o=attacker(s,a.ref);if(!o.keywords.includes('vigilance'))o.tapped=true;event(s,{kind:'attack',object:a.ref,player:p});}
}
function chooseBlockers(s,p,list) {
  if(!Array.isArray(list))fail('Invalid blockers');
  const used=new Set();
  for(const b of list) {
    const o=dereference(s,b.ref),a=s.combat.attackers.find(a=>same(a.ref,b.attacker)),at=attacker(s,b.attacker);
    if(!a||a.defender!==p||!at||!o||o.phased||o.zone!=='battlefield'||o.controller!==p||!o.types.includes('creature')||o.tapped||used.has(o.id)||(at.keywords.includes('flying')&&!o.keywords.some(k=>k==='flying'||k==='reach')))fail('Illegal blocker');
    used.add(o.id);
  }
  for(const a of s.combat.attackers.filter(a=>a.defender===p)){
    const n=list.filter(b=>same(b.attacker,a.ref)).length;
    if(n===1&&attacker(s,a.ref)?.keywords.includes('menace'))fail('Menace requires at least two blockers');
    a.blocked=n>0;
  }
  s.combat.blocks.push(...clone(list));
}
function inCombat(s,ref){const o=dereference(s,ref);return o?.zone==='battlefield'&&o.types.includes('creature')?o:null;}
function combatSources(s){return [...s.combat.attackers.map(a=>a.ref),...s.combat.blocks.map(b=>b.ref)].map(r=>inCombat(s,r)).filter(Boolean);}
function strikes(o){return o.keywords.includes('first strike')||o.keywords.includes('double strike');}
function beginDamage(s) {
  s.combat.round=combatSources(s).some(strikes)?'first':'normal';s.combat.first=combatSources(s).filter(strikes).map(reference);assignDamage(s);
}
function assignDamage(s) {
  s.combat.assignments=[];s.combat.assigners=apnap(s).filter(p=>combatSources(s).some(o=>o.controller===p&&eligible(s,o)));
  if(s.combat.assigners.length)stepDecision(s,'damage',s.combat.assigners[0]);
  else dealCombat(s);
}
function eligible(s,o){return s.combat.round==='first'?strikes(o):o.keywords.includes('double strike')||!s.combat.first.some(r=>same(r,reference(o)));}
function chooseDamage(s,p,list) {
  if(!Array.isArray(list))fail('Invalid damage assignment');
  const own=combatSources(s).filter(o=>o.controller===p&&eligible(s,o));
  for(const o of own) {
    const ref=reference(o),a=s.combat.attackers.find(a=>same(a.ref,ref)),block=s.combat.blocks.find(b=>same(b.ref,ref));
    const blockers=a?s.combat.blocks.filter(b=>same(b.attacker,ref)).map(b=>inCombat(s,b.ref)).filter(Boolean):[];
    const at=block?inCombat(s,block.attacker):null;
    const targets=a?blockers.map(x=>({kind:'object',...reference(x)})):at?[{kind:'object',...reference(at)}]:[];
    const toPlayer=a&&live(s,a.defender)&&(!a.blocked||o.keywords.includes('trample'));
    if(toPlayer)targets.push({kind:'player',player:a.defender});
    const rows=list.filter(x=>same(x.source,ref));
    const eq=(x,y)=>x.kind===y.kind&&(x.kind==='player'?x.player===y.player:same(x,y));
    if(rows.some(x=>!nat(x.n)||!targets.some(t=>eq(t,x.target)))||new Set(rows.map(x=>JSON.stringify(x.target))).size!==rows.length)fail('Illegal combat damage target');
    if(rows.reduce((n,x)=>n+x.n,0)!==(targets.length?Math.max(0,power(o)):0))fail('Incorrect combat damage total');
    if(toPlayer&&a.blocked&&rows.some(x=>x.target.kind==='player'&&x.n>0))for(const b of blockers) {
      const n=rows.find(x=>eq(x.target,{kind:'object',...reference(b)}))?.n??0;
      const lethal=Math.max(0,toughness(b)-(b.damage??0));
      if(n<(o.keywords.includes('deathtouch')?Math.min(1,lethal):lethal))fail('Trample must assign lethal damage first');
    }
  }
  if(list.some(x=>!own.some(o=>same(reference(o),x.source))))fail('Invalid combat source');
  s.combat.assignments.push(...clone(list));
}
function dealCombat(s) {
  const assignments=s.combat.assignments.map(x=>({...x,o:inCombat(s,x.source)}));
  for(const x of assignments)if(x.o)damage(s,x.target,x.n,x.o,true);
  settle(s);
}
function answer(s,p,c) {
  const d=s.decision;if(!d||d.player!==p)fail('No decision for player');
  s.decision=null;
  switch(d.kind) {
    case 'legend':if(!d.refs.some(r=>same(r,c.keep)))fail('Invalid legend choice');(s.legendKeeps??=[]).push({refs:d.refs,keep:clone(c.keep)});break;
    case 'commander-replacement':{
      if(typeof c.yes!=='boolean'||!s.resolution||!same(s.resolution.refs[0],d.ref))fail('Invalid commander replacement');
      s.resolution.choices[d.ref.id]=c.yes;s.resolution.refs.shift();continueResolution(s);return;
    }
    case 'commander':{const o=dereference(s,d.ref);if(!o||typeof c.yes!=='boolean')fail('Invalid commander choice');o.commandPending=false;if(c.yes)move(s,o,'command');break;}
    case 'trigger-order':if(!Array.isArray(c.ids)||c.ids.length!==d.ids.length||new Set(c.ids).size!==d.ids.length||c.ids.some(id=>!d.ids.includes(id)))fail('Invalid trigger order');(s.triggerOrders??={})[p]=clone(c.ids);break;
    case 'attackers':chooseAttackers(s,p,c.attackers);break;
    case 'blockers':chooseBlockers(s,p,c.blocks);s.combat.defenders.shift();if(s.combat.defenders.length){stepDecision(s,'blockers',s.combat.defenders[0]);return;}break;
    case 'damage':chooseDamage(s,p,c.assignments);s.combat.assigners.shift();if(s.combat.assigners.length){stepDecision(s,'damage',s.combat.assigners[0]);return;}dealCombat(s);return;
    case 'discard':{const refs=c.refs;if(!Array.isArray(refs)||refs.length!==d.count||new Set(refs.map(r=>r.id)).size!==refs.length||refs.some(r=>{const o=dereference(s,r);return o?.zone!=='hand'||o.owner!==p;}))fail('Invalid discard');moveBatch(s,refs.map(ref=>({ref,to:'graveyard'})));cleanup(s);return;}
    default:fail('Unknown decision');
  }
  settle(s);
}
function cast(s,p,c) {
  const o=dereference(s,c.ref);
  if(!o||o.owner!==p||!['hand','command'].includes(o.zone))fail('Card not castable from zone');
  const d=def(s,o);
  if(o.types.includes('land')||(!o.types.includes('instant')&&!o.keywords.includes('flash')&&!(p===s.active&&main(s)&&!s.stack.length)))fail('Illegal casting timing');
  const chosen=targets(s,d,p,c.targets??[]);
  const tax=o.zone==='command'?2*(s.players[p].commanderCasts[o.id]??0):0;
  pay(s,p,d.cost,c.payment??[],tax);
  if(o.zone==='command')s.players[p].commanderCasts[o.id]=(s.players[p].commanderCasts[o.id]??0)+1;
  moveBatch(s,[{ref:reference(o),to:'stack',controller:p}]);
  commitAction(s,p,{kind:'spell',controller:p,source:reference(o),lastKnown:clone(o),name:o.name,effects:d.effects??[],targets:chosen,specs:d.targets??[],uncounterable:!!d.uncounterable,exileOnLeave:!!d.exileOnLeave});
  event(s,{kind:'cast',object:reference(o),player:p});
}
function activate(s,p,c) {
  const o=dereference(s,c.ref);
  if(!o||o.phased||o.zone!=='battlefield'||o.controller!==p)fail('Invalid ability source');
  const a=def(s,o).abilities?.[c.ability];if(!a)fail('Unknown ability');
  if(a.sorcery&&!(p===s.active&&main(s)&&!s.stack.length))fail('Illegal activation timing');
  if(a.tap&&(o.tapped||(o.types.includes('creature')&&o.sick&&!o.keywords.includes('haste'))))fail('Cannot tap source');
  const chosen=targets(s,a,p,c.targets??[]);
  pay(s,p,a.cost,c.payment??[]);if(a.tap)o.tapped=true;
  const item={kind:'activated',controller:p,source:reference(o),lastKnown:clone(o),name:o.name,effects:a.effects??[],targets:chosen,specs:a.targets??[]};
  if(a.mana){effects(s,item,chosen);return;}
  commitAction(s,p,item);
}
function playLand(s,p,c) {
  const o=dereference(s,c.ref);
  if(!o||o.zone!=='hand'||o.owner!==p||!o.types.includes('land')||p!==s.active||!main(s)||s.stack.length||s.players[p].lands>=1)fail('Illegal land play');
  s.players[p].lands++;move(s,o,'battlefield',{controller:p});
}
function prepareResolution(s,id) {
  const item=s.stack.at(-1), refs=[];
  for(const e of item.effects??[])if(e.kind==='bounce') {
    const t=item.targets[e.target],o=dereference(s,t);
    if(o?.commander&&legal(s,t,item.specs[e.target],item.controller)&&!refs.some(r=>r.id===o.id))refs.push(reference(o));
  }
  s.resolution={id,refs,choices:{}};
  continueResolution(s);
}
function continueResolution(s) {
  const r=s.resolution;
  if(r.refs.length) {
    const ref=r.refs[0],o=dereference(s,ref);
    if(o){decision(s,'commander-replacement',o.owner,{ref});return;}
    r.refs.shift();return continueResolution(s);
  }
  delete s.resolution;
  resolve(s,r.id,{commanderChoices:r.choices});settle(s);
}
function resolve(s,id,c) {
  const result=resolveTop(s,id,(state,t,item)=>legal(state,t,item.specs[item.targets.indexOf(t)],item.controller),(state,item,chosen)=>{
    const o=dereference(state,item.source);
    effects(state,item,chosen,c.commanderChoices??{});
    if(item.kind==='spell'&&o?.zone==='stack') {
      if(permanent(o))move(state,o,'battlefield',{controller:item.controller});
      else dispose(state,item);
    }
  });
  if(result.kind==='all-targets-illegal')dispose(s,result.item);
}
export function dispatch(state,player,command) {
  if(!command||command.version!==state.version||state.over||!live(state,player))fail('Stale or unavailable game');
  const s=clone(state);
  if(command.kind==='concede'){s.decision=null;delete s.legendKeeps;delete s.triggerOrders;delete s.resolution;leave(s,player);if(!finish(s))settle(s);}
  else if(s.decision) {
    if(command.kind!=='choose')fail('Decision pending');answer(s,player,command);
  } else {
    if(s.priority!==player)fail('No priority');
    if(command.kind==='pass') {
      const result=passPriority(s,player);
      if(result.kind==='resolve'){s.resume=s.active;prepareResolution(s,result.id);}
      else if(result.kind==='advance'){
        if(s.step==='damage'&&s.combat.round==='first'){for(const p of s.seats)s.players[p].mana=manaPool();s.combat.round='normal';assignDamage(s);}
        else advance(s);
      }
    } else {
      s.resume=player;
      if(command.kind==='cast')cast(s,player,command);
      else if(command.kind==='activate')activate(s,player,command);
      else if(command.kind==='land')playLand(s,player,command);
      else fail('Unknown command');
      settle(s);
    }
  }
  s.version++;Object.assign(state,s);return view(state,player);
}
export function view(s,p) {
  const visible=Object.values(s.objects).filter(o=>o.zone!=='library'&&(o.zone!=='hand'||o.owner===p)&&!o.faceDown);
  return clone({version:s.version,seats:s.seats,active:s.active,priority:s.priority,step:s.step,turn:s.turn,over:s.over,winner:s.winner,
    players:Object.values(s.players).map(x=>({id:x.id,life:x.life,poison:x.poison,lost:!!x.lost,hand:objects(s,'hand').filter(o=>o.owner===x.id).length,library:s.libraries[x.id].length,commanderDamage:x.commanderDamage,...(x.id===p?{mana:x.mana}:{})})),
    objects:visible,stack:s.stack.map(({lastKnown,effects,specs,...x})=>x),
    decision:s.decision?(s.decision.player===p?s.decision:{kind:s.decision.kind,player:s.decision.player}):null,combat:s.combat?{attackers:s.combat.attackers,blocks:s.combat.blocks,round:s.combat.round}:null});
}
