// Local data-only catalogue. Remote texts are never evaluated as code.
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';

const WIZARDS = 'https://magic.wizards.com/en/rules';
const BULK = 'https://api.scryfall.com/bulk-data/oracle-cards';
const headers = { 'User-Agent': 'MesaCommander/1.0 (local rules catalog)', Accept: 'application/json, text/plain, */*' };
const key = n => String(n || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu,'').replace(/\s+/g,' ').trim();

export async function* cardObjects(body) {
  const decoder = new TextDecoder('utf-8',{fatal:true});
  let started=false, ended=false, expect='first', depth=0, quoted=false, escaped=false, item='', bytes=0;
  function* consume(chunk) {
    for (const ch of chunk) {
      if (depth) {
        item += ch;
        if (item.length > 512*1024) throw Error('Oversized catalog entry');
        if (quoted) {
          if (escaped) escaped=false;
          else if (ch==='\\') escaped=true;
          else if (ch==='"') quoted=false;
        } else if (ch==='"') quoted=true;
        else if (ch==='{' || ch==='[') depth++;
        else if (ch==='}' || ch===']') {
          if (--depth===0) { const card=JSON.parse(item); item=''; expect='separator'; yield card; }
        }
        continue;
      }
      if (/\s/.test(ch)) continue;
      if (ended) throw Error('Unexpected catalog suffix');
      if (!started) { if (ch!=='[') throw Error('Catalog is not an array'); started=true; continue; }
      if (ch===']' && (expect==='first' || expect==='separator')) { ended=true; continue; }
      if (ch===',' && expect==='separator') { expect='object'; continue; }
      if (ch==='{' && (expect==='first' || expect==='object')) { depth=1; item='{'; continue; }
      throw Error('Invalid catalog separator');
    }
  }
  for await (const chunk of body) {
    bytes+=chunk.byteLength;
    if (bytes>400*1024*1024) throw Error('Catalog too large');
    yield* consume(decoder.decode(chunk,{stream:true}));
  }
  yield* consume(decoder.decode());
  if (!ended || depth) throw Error('Truncated catalog');
}
function face(c) {
  const out={};
  for (const k of ['name','flavor_name','mana_cost','type_line','oracle_text','power','toughness','loyalty','defense','colors','image_uris']) if(c[k]!=null) out[k]=c[k];
  return out;
}
export function compactCard(c) {
  if(c?.object!=='card'||typeof c.name!=='string'||!c.name||typeof c.type_line!=='string') return null;
  const out=face(c);
  for(const k of ['oracle_id','layout','cmc','keywords','color_identity','produced_mana','legalities']) if(c[k]!=null) out[k]=c[k];
  if(Array.isArray(c.card_faces)) out.card_faces=c.card_faces.map(face);
  return out;
}
export function indexCards(cards) {
  const names=new Map(), aliases=new Map();
  for(const c of cards) {
    if(!c||typeof c.name!=='string') continue;
    const k=key(c.name);
    names.set(k,names.has(k)?null:c);
    for(const n of [c.flavor_name,c.card_faces?.[0]?.name,c.card_faces?.[0]?.flavor_name]) {
      if(!n) continue;
      const a=key(n); aliases.set(a,aliases.has(a)&&aliases.get(a)!==c?null:c);
    }
  }
  return {get:n=>names.has(key(n))?names.get(key(n)):aliases.get(key(n))};
}
export function rulesTextURL(html) {
  const m=html.match(/href\s*=\s*["']([^"']*MagicCompRules[^"']*\.txt(?:\?[^"']*)?)["']/i);
  if(!m) throw Error('Wizards TXT link not found');
  const u=new URL(m[1].replaceAll('&amp;','&'),WIZARDS);
  if(u.protocol!=='https:'||u.hostname!=='media.wizards.com'||u.username||u.password) throw Error('Invalid Wizards rules URL');
  return u.href;
}
async function atomicJSON(file,data) {
  const tmp=file+'.tmp-'+process.pid;
  await writeFile(tmp,JSON.stringify(data),{mode:0o600});
  await rename(tmp,file);
}
async function get(url,timeout=30000) {
  const r=await fetch(url,{headers,signal:AbortSignal.timeout(timeout),redirect:'follow'});
  if(!r.ok) throw Error('HTTP '+r.status);
  const u=new URL(r.url);
  if(u.protocol!=='https:'||!['magic.wizards.com','www.magic.wizards.com','media.wizards.com','api.scryfall.com','data.scryfall.io'].includes(u.hostname)) throw Error('Unexpected data host');
  return r;
}
export function madridClock(now=new Date()) {
  const p=Object.fromEntries(new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Madrid',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(now).map(x=>[x.type,x.value]));
  return {day:p.year+'-'+p.month+'-'+p.day,hour:Number(p.hour)};
}
export function startRulesCatalog({directory='/data/rules',log=console}={}) {
  let snapshot=null,index=null,running=false,closed=false,attempted='';
  const oracleFile=path.join(directory,'oracle.json'), rulesFile=path.join(directory,'comprehensive.json');
  const loaded=(async()=>{
    await mkdir(directory,{recursive:true});
    try {
      const data=JSON.parse(await readFile(oracleFile,'utf8'));
      if(typeof data.version!=='string'||!Array.isArray(data.cards)||data.cards.length<1000) throw Error('Invalid saved catalog');
      index=indexCards(data.cards); snapshot=data;
    } catch(e) { if(e.code!=='ENOENT') log.warn('Oracle cache unavailable:',e.message); }
  })().catch(e=>log.warn('Rules directory unavailable:',e.message));
  async function refreshOracle() {
    const meta=await (await get(BULK)).json();
    if(meta.type!=='oracle_cards'||typeof meta.updated_at!=='string') throw Error('Invalid Oracle metadata');
    if(snapshot?.version===meta.updated_at) return;
    const u=new URL(meta.download_uri);
    if(u.protocol!=='https:'||u.hostname!=='data.scryfall.io'||u.username||u.password) throw Error('Invalid Oracle download URL');
    const response=await get(u.href,240000), cards=[];
    for await(const card of cardObjects(response.body)) {
      const c=compactCard(card); if(c) cards.push(c);
      if(cards.length>100000) throw Error('Too many entries');
    }
    if(cards.length<1000||(snapshot&&cards.length<snapshot.cards.length*.8)) throw Error('Incomplete Oracle catalog');
    const next={version:meta.updated_at,cards}, nextIndex=indexCards(cards);
    await atomicJSON(oracleFile,next); snapshot=next; index=nextIndex;
    log.info('Oracle catalog updated:',next.version,cards.length);
  }
  async function refreshRules() {
    const url=rulesTextURL(await (await get(WIZARDS)).text());
    const content=await (await get(url)).text();
    if(content.length<100000||!/100\.\s+General/i.test(content)||!/903\.\s+Commander/i.test(content)) throw Error('Invalid rules text');
    const sha256=createHash('sha256').update(content).digest('hex');
    let old; try {old=JSON.parse(await readFile(rulesFile,'utf8'));} catch {}
    if(old?.sha256===sha256&&old.url===url) return;
    await atomicJSON(rulesFile,{url,sha256,downloadedAt:new Date().toISOString(),content});
    log.info('Comprehensive Rules updated:',sha256);
  }
  async function tick(startup=false) {
    if(running||closed) return;
    const clock=madridClock();
    if(!startup&&(clock.hour<7||attempted===clock.day)) return;
    if(clock.hour>=7) attempted=clock.day;
    running=true;
    try {
      await loaded;
      const results=await Promise.allSettled([refreshOracle(),refreshRules()]);
      for(const [i,r] of results.entries()) if(r.status==='rejected') log.warn((i?'Wizards rules':'Oracle')+' refresh failed; retaining previous snapshot:',r.reason?.message);
    } finally {running=false;}
  }
  const timer=setInterval(()=>void tick(),300000); timer.unref();
  void tick(true);
  return {
    async lookup(names) {
      await loaded;
      if(!Array.isArray(names)||names.length>800||names.some(n=>typeof n!=='string'||n.length>250)) throw Error('Invalid lookup');
      return {version:snapshot?.version||null,cards:index?[...new Set(names)].map(n=>[n,index.get(n)]).filter(([,c])=>c):[]};
    },
    close(){closed=true;clearInterval(timer);}
  };
}
