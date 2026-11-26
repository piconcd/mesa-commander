// Pure, serializable rules primitives. No DOM or external engines.
export function newRulesState(seats, active=seats[0]) {
  if (!Array.isArray(seats) || !seats.length || new Set(seats).size!==seats.length || !seats.includes(active)) throw Error('Invalid seats');
  return { seats:[...seats], active, priority:null, passes:[], stack:[], pending:[], objects:{}, nextId:1, decision:null, ready:null };
}
const copy = v => structuredClone(v);
const requireSeat = (s, p) => { if (!s.seats.includes(p)) throw Error('Player not in game'); };
export function apnap(s) {
  const i=s.seats.indexOf(s.active);
  return i<0 ? [...s.seats] : [...s.seats.slice(i), ...s.seats.slice(0,i)];
}
function nextSeat(s,p) {
  requireSeat(s,p);
  return s.seats[(s.seats.indexOf(p)+1)%s.seats.length];
}
export function createObject(s, object) {
  requireSeat(s,object.owner);
  if (object.controller != null) requireSeat(s,object.controller);
  const id=s.nextId++;
  s.objects[id]={ ...copy(object), id, generation:0 };
  return reference(s.objects[id]);
}
export const reference = obj => ({ id:obj.id, generation:obj.generation });
export function dereference(s, ref) {
  const obj=ref&&s.objects[ref.id];
  return obj&&obj.generation===ref.generation ? obj : null;
}
export function changeZone(s, ref, to, {controller}={}) {
  const obj=dereference(s,ref);
  if (!obj) throw Error('Stale object reference');
  if (controller!=null) requireSeat(s,controller);
  const lastKnown=copy(obj);
  if (obj.zone!==to) {
    obj.zone=to; obj.generation++;
    obj.controller=controller??obj.owner;
    // These are properties of a game object, not of its physical card.
    for (const k of ['damage','counters','attachments','tapped','temporary','combat','phased']) delete obj[k];
  }
  return { lastKnown, object:reference(obj) };
}
function entry(s, object) {
  requireSeat(s,object.controller);
  if (!['spell','activated','triggered','copy'].includes(object.kind)) throw Error('Invalid stack object');
  return {...copy(object), id:s.nextId++};
}
// Choices and costs must have been made legally before committing an action.
// A validation/payment adapter runs on a copy: failure leaves original state intact.
export function commitAction(s, player, object, prepare=()=>true) {
  if (s.decision || s.pending.length || s.priority!==player) throw Error('No priority');
  if (object.controller!==player || object.kind==='triggered') throw Error('Invalid action controller/kind');
  const draft=copy(s);
  const proposed=copy(object);
  if (prepare(draft,proposed)!==true) throw Error('Illegal action or unpaid cost');
  draft.stack.push(entry(draft,proposed));
  draft.passes=[]; draft.priority=player; draft.ready=null;
  Object.assign(s,draft);
  return s.stack.at(-1).id;
}
export function queueTrigger(s, object) {
  if (object.kind!=='triggered') throw Error('Not a triggered ability');
  const t=entry(s,object);
  s.pending.push(t); s.ready=null; return t.id;
}
// Controller supplies bottom-to-top ordering for their own simultaneous triggers.
export function putTriggers(s, orders={}) {
  if (s.decision) throw Error('Unresolved decision');
  const ordered=[];
  for (const p of apnap(s)) {
    const own=s.pending.filter(t=>t.controller===p);
    const ids=orders[p]??(own.length<=1?own.map(t=>t.id):null);
    if (!Array.isArray(ids)||ids.length!==own.length||new Set(ids).size!==ids.length||ids.some(id=>!own.some(t=>t.id===id))) throw Error('Trigger order required');
    ordered.push(...ids.map(id=>own.find(t=>t.id===id)));
  }
  s.stack.push(...ordered); s.pending=[]; s.passes=[]; s.ready=null;
  return ordered.map(t=>t.id);
}
export function grantPriority(s, player=s.active) {
  requireSeat(s,player);
  if (s.pending.length || s.decision) throw Error('Resolve SBAs/trigger ordering/decisions first');
  s.priority=player; s.passes=[]; s.ready=null;
}
export function passPriority(s, player) {
  if (s.pending.length || s.decision || player!==s.priority) throw Error('No priority');
  s.passes.push(player);
  if (s.passes.length<s.seats.length) {
    s.priority=nextSeat(s,player); return {kind:'priority',player:s.priority};
  }
  s.priority=null; s.passes=[];
  if (!s.stack.length) return {kind:'advance'};
  s.ready=s.stack.at(-1).id;
  return {kind:'resolve',id:s.ready};
}
// Must be invoked after unanimous passes. Keep illegal target slots, do not retarget.
export function resolveTop(s, id, legalTarget, resolve) {
  if (s.ready!==id || s.priority!==null || s.pending.length || s.decision || s.stack.at(-1)?.id!==id) throw Error('Not ready to resolve');
  const draft=copy(s), item=draft.stack.pop(); draft.ready=null;
  const targets=(item.targets??[]).map(t=>legalTarget(draft,t,item)?t:null);
  if (targets.length&&targets.every(t=>t===null)) {
    Object.assign(s,draft); return {kind:'all-targets-illegal',item};
  }
  resolve(draft,item,targets);
  Object.assign(s,draft); return {kind:'resolved',item};
}
export function counter(s,id) {
  const i=s.stack.findIndex(x=>x.id===id);
  if(i<0 || s.stack[i].uncounterable) return null;
  return s.stack.splice(i,1)[0];
}
// Rule 616: caller supplies the correct priority class and the affected player's choice.
// Re-evaluate applicability after each transformation; no effect applies twice to an event.
export function replaceEvent(initial, effects, choose) {
  let event=copy(initial);
  const used=new Set();
  while (event!=null) {
    const eligible=effects.filter(e=>!used.has(e.id)&&e.applies(event));
    if (!eligible.length) break;
    const rank=Math.min(...eligible.map(e=>e.rank??4));
    const options=eligible.filter(e=>(e.rank??4)===rank);
    const id=options.length===1?options[0].id:choose(copy(event),options.map(e=>e.id));
    const selected=options.find(e=>e.id===id);
    if (!selected) throw Error('Replacement choice required');
    used.add(id); event=selected.apply(event);
  }
  return {event, applied:[...used]};
}
// Sorting primitive for already classified continuous effects. Dependencies must
// be calculated using CR 613 by the card/effect adapter; cycles use timestamp.
export function layerOrder(effects) {
  const result=[];
  const groups=new Map();
  for(const e of effects) {
    const key=(e.layer??0)*100+(e.sublayer??0);
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push(e);
  }
  for(const key of [...groups.keys()].sort((a,b)=>a-b)) {
    const left=groups.get(key).slice().sort((a,b)=>(a.timestamp??0)-(b.timestamp??0));
    while(left.length) {
      const ids=new Set(left.map(e=>e.id));
      const reaches=(from,to,seen=new Set())=>{
        if(from===to)return true;
        if(seen.has(from))return false;
        seen.add(from);
        return (left.find(e=>e.id===from)?.dependsOn??[]).some(d=>ids.has(d)&&reaches(d,to,seen));
      };
      const idx=left.findIndex(e=>!(e.dependsOn??[]).some(d=>ids.has(d)&&d!==e.id&&!reaches(d,e.id)));
      result.push(left.splice(idx<0?0:idx,1)[0]);
    }
  }
  return result;
}
// Collect basic SBAs from a single snapshot. The caller applies the whole batch
// simultaneously, asks mandatory legend choices and repeats until stable.
export function basicSbas({players, permanents}) {
  const actions=[], groups=new Map();
  for(const p of players) {
    if(p.life<=0||p.poison>=10||p.drewEmpty||Object.values(p.commanderDamage??{}).some(n=>n>=21)) actions.push({kind:'lose',player:p.id});
  }
  for(const p of permanents) {
    if(p.phased)continue;
    const ref=reference(p), types=p.types??[];
    if(types.includes('creature')&&p.toughness<=0) actions.push({kind:'graveyard',ref});
    else if(types.includes('creature')&&!p.indestructible&&((p.damage??0)>=p.toughness||p.deathtouchDamage)) actions.push({kind:'destroy',ref});
    if(types.includes('planeswalker')&&(p.counters?.loyalty??0)<=0) actions.push({kind:'graveyard',ref});
    if(types.includes('aura')&&p.attachmentLegal===false)actions.push({kind:'graveyard',ref});
    if(!types.includes('aura')&&p.attachmentLegal===false)actions.push({kind:'unattach',ref});
    const n=Math.min(p.counters?.plus??0,p.counters?.minus??0);
    if(n>0)actions.push({kind:'cancel-counters',ref,n});
    if(p.legendary&&!p.legendExempt){
      const key=JSON.stringify([p.controller,p.name]);
      if(!groups.has(key))groups.set(key,[]);
      groups.get(key).push(ref);
    }
  }
  for(const [key,refs] of groups)if(refs.length>1)actions.push({kind:'legend-choice',controller:JSON.parse(key)[0],refs});
  return actions;
}
