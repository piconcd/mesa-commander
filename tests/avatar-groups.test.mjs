import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../app/index.html', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

function slice(from, to) {
  const begin = html.indexOf(from);
  const end = html.indexOf(to, begin + from.length);
  assert.ok(begin >= 0 && end > begin, `no encuentro ${from}`);
  return html.slice(begin, end);
}

const KW_LIST = ['flying', 'lifelink', 'menace', 'trample', 'haste'];
const kwList = t => (t || '').split(/,\s*|\s+and\s+/).map(z => z.trim()).filter(z => KW_LIST.includes(z));
const NUMW = { one: 1, two: 2, three: 3, four: 4 };
const cdNum = w => (/^\d+$/.test(w) ? +w : NUMW[w] || 0);
const parseCost = c => ({ generic: +(c.match(/\{(\d+)\}/) || [0, 0])[1], pips: (c.match(/\{[a-z]\}/g) || []).map(p => [p.slice(1, -1).toUpperCase()]) });
const PE_MAP = {
  'put a double strike counter on ~': [{ k: 'l11CtrSelf', kind: 'double strike' }],
  'put two +1/+1 counters on ~': [{ k: 'selfCounters', n: 2 }],
  'take an extra turn after this one': [{ k: 'extraTurn' }],
  'create a 1/1 white ally creature token': [{ k: 'tokens', n: 1 }],
  'search your library for a basic land card, reveal it, put it into your hand, then shuffle': [{ k: 'tutor', f: 'basic land' }],
  'search your library for a shrine card, reveal it, put it into your hand, then shuffle': [{ k: 'tutor', f: 'shrine' }],
  'search your library for up to two basic land cards, put them onto the battlefield tapped, then shuffle': [{ k: 'ramp', n: 2 }],
  "return target nonland permanent to its owner's hand": [{ k: 'bounce', f: 'nonland permanent' }],
  'you may sacrifice an artifact or creature. if you do, draw a card': [{ k: 'cdMay', cost: { sac: 'artifact or creature' }, ops: [{ k: 'draw', n: 1 }] }],
  'look at the top five cards of your library. you may reveal a creature or land card from among them and put it into your hand. put the rest on the bottom of your library in a random order': [{ k: 'dig', n: 5, f: 'creature or land' }],
};
const parseEffects = s => (PE_MAP[s] || []).map(o => Object.assign({}, o));
const l7Safe = (eff, ops) => !!ops && ops.length > 0;
const x26Trig = (a, tr) => { (a.fxT ||= []).push(tr); return true; };
const fired = []; const trigger = (x, ops) => fired.push(ops);
const used = new Set(); const x26TurnOnce = (x, k) => { const key = x.id + k; if (used.has(key)) return false; used.add(key); return true; };
const G = { active: 1, turnsTaken: 3 };
const D = c => ({ type_line: c.type || '' }); const P = c => c.p || 0;
const l11Line = new Function('parseEffects', 'kwList', 'cdNum', 'parseCost', 'KW_LIST', 'l7Safe', 'x26Trig', 'trigger', 'x26TurnOnce', 'G', 'D', 'P',
  slice('function l11Line(a, l) {', '{ const _el = eoeLine; eoeLine = function (a, l, PE) { if (l11Line') + '\nreturn l11Line;')(parseEffects, kwList, cdNum, parseCost, KW_LIST, l7Safe, x26Trig, trigger, x26TurnOnce, G, D, P);
const newA = () => ({ acts: [] });

test('exhaust: once per object, with waterbend costs too', () => {
  const m = newA(); assert.ok(l11Line(m, 'exhaust — {3}: put a double strike counter on ~.'));
  assert.deepEqual([m.acts[0].generic, m.acts[0].cond.l11Exh, m.acts[0].ops[0].k], [3, true, 'l11ExhMark']);
  const k = newA(); assert.ok(l11Line(k, 'exhaust — waterbend {20}: take an extra turn after this one.')); assert.deepEqual([k.acts[0].generic, k.acts[0].wb], [20, 20]);
  assert.equal(l11Line(newA(), 'exhaust — {3}: do something unknown.'), false);
  assert.match(html, /if \(k && k\.l11Exh && c && c\.l11Exh\) return 'Agotamiento: esta habilidad ya se ha activado\.';/);
  assert.match(html, /if \(G && c && to === 'bf' && from !== 'bf' && c\.zone === 'bf'\) \{ c\.l11Exh = null;/, 'a new object can use it again');
  assert.match(html, /if \(!CTR_KW\.includes\('double strike'\)\) CTR_KW\.push\('double strike'\);/);
});

test('statics with a condition', () => {
  const a = newA(); assert.ok(l11Line(a, "~ gets +1/+1 as long as there's a lesson card in your graveyard.")); assert.deepEqual(a.selfCond[0], { cond: 'l11lesson:1', p: 1, t: 1, kw: [] });
  const b = newA(); assert.ok(l11Line(b, "as long as you've drawn two or more cards this turn, ~ has lifelink and menace.")); assert.deepEqual(b.selfCond[0].kw, ['lifelink', 'menace']);
  const c = newA(); assert.ok(l11Line(c, "~ can't be blocked as long as you've drawn two or more cards this turn.")); assert.equal(c.l11UnblDrawn, 2);
  const d = newA(); assert.ok(l11Line(d, "~ can't attack or block unless there are three or more lesson cards in your graveyard.")); assert.deepEqual(d.l11CantAB, { lesson: 3 });
  const e = newA(); assert.ok(l11Line(e, "~ can't attack or block unless you control another creature with power 4 or greater.")); assert.deepEqual(e.l11CantAB, { pow: 4 });
  const f = newA(); assert.ok(l11Line(f, 'creatures you control with flying get +1/+1.')); assert.deepEqual(f.l9Grants[0], { other: false, p: 1, t: 1, kws: [], ward: 0, kwReq: 'flying' });
  const s = newA(); assert.ok(l11Line(s, "this token can't block or be blocked by non-~ creatures.")); assert.equal(s.l11SpiritOnly, true);
  assert.ok(l11Line(newA(), "untap ~ during each other player's untap step."));
  assert.ok(l11Line(newA(), "~ enters with a +1/+1 counter on it if you attacked this turn."));
  assert.ok(l11Line(newA(), "each creature you control with power 4 or greater can't be blocked by more than one creature."));
});

test('triggers', () => {
  const su = newA(); assert.ok(l11Line(su, 'whenever another permanent you control leaves the battlefield during your turn, create a 1/1 white ally creature token. this ability triggers only once each turn.'));
  const x = { id: 1, zone: 'bf', ctl: 1 }; fired.length = 0; su.fxT[0].run(x, { c: { id: 2 } }); su.fxT[0].run(x, { c: { id: 3 } }); assert.equal(fired.length, 1);
  G.active = 2; const x2 = { id: 9, zone: 'bf', ctl: 1 }; su.fxT[0].run(x2, { c: { id: 4 } }); assert.equal(fired.length, 1, 'only during your turn'); G.active = 1;
  const bw = newA(); assert.ok(l11Line(bw, 'whenever another creature you control dies, if it had counters on it, put its counters on ~.'));
  fired.length = 0; bw.fxT[0].run({ id: 5, zone: 'bf' }, { c: { id: 6, zone: 'gone' }, wasCre: true, intended: 'gy', ctrs: { p1: 2, flying: 1 } });
  assert.deepEqual(fired[0], [{ k: 'l11PutCtrs', list: [['p1', 2], ['flying', 1]] }], 'a token that died still gives its counters');
  const ek = newA(); assert.ok(l11Line(ek, 'whenever you put one or more +1/+1 counters on a creature, you may gain that much life. do this only once each turn.'));
  const bh = newA(); assert.ok(l11Line(bh, "whenever a nonland creature you control dies, earthbend x, where x is that creature's power."));
  fired.length = 0; bh.fxT[0].run({ id: 7 }, { c: { _lastP: 3, n: 'x' } }); assert.deepEqual(fired[0], [{ k: 'avEarthbend', n: 3 }]);
  const tp = newA(); assert.ok(l11Line(tp, 'whenever you cast a spell, earthbend 1. if that spell is a lesson, put an additional +1/+1 counter on that land.'));
  for (const l of ['whenever a creature you control attacks alone, it gets +x/+x until end of turn, where x is the number of creatures you control.', 'whenever ~ and at least one other creature attack, draw a card.',
    'whenever one or more creatures you control with power 4 or greater attack, search your library for up to that many basic land cards, put them onto the battlefield tapped, then shuffle.',
    'whenever one or more creatures you control with flying attack, draw a card, then discard a card. when you discard a nonland card this way, put a +1/+1 counter on target creature you control.']) assert.ok(l11Line(newA(), l), l);
});

const l9CountSpec = txt => (txt === 'the number of shrines you control' ? ['shrines'] : txt === 'the number of swamps you control' ? ['swamps'] : txt === 'the number of lands you control' ? ['lands'] : txt === 'the number of creatures you control' ? ['creatures'] : null);
const l11Sentence = new Function('kwList', 'l9CountSpec', slice('function l11Sentence(s, pe) {', '{ const _pe = parseEffects; parseEffects = function (s) { const r = typeof s === \'string\' ? l11Sentence') + '\nreturn l11Sentence;')(kwList, l9CountSpec);

test('whole sentences', () => {
  const aj = l11Sentence('search your library for a basic land card. if this spell was kicked, instead search your library for a basic land card and a shrine card. reveal those cards, put them into your hand, then shuffle', parseEffects);
  assert.deepEqual(aj.map(o => [o.f, o.cnd.not ? 'sin kicker' : 'kicker']), [['basic land', 'sin kicker'], ['basic land', 'kicker'], ['shrine', 'kicker']]);
  assert.deepEqual(l11Sentence('it deals damage equal to the number of swamps you control to any target', parseEffects), [{ k: 'dmg', n: 0, f: 'any target', l11cnt: ['swamps'] }]);
  assert.deepEqual(l11Sentence('he deals damage equal to the number of creatures you control to target creature an opponent controls', parseEffects), [{ k: 'dmg', n: 0, f: 'creature an opponent controls', l11cnt: ['creatures'] }]);
  assert.equal(l11Sentence('~ deals damage equal to 2 plus the number of lesson cards in your graveyard to target creature', parseEffects), null);
  assert.deepEqual(l11Sentence('~ deals 2 damage to target creature. if this spell was kicked, it deals 5 damage to that creature instead', parseEffects), [{ k: 'dmg', n: 2, f: 'creature', l11kick: 5 }]);
  const bb = l11Sentence("return target nonland permanent to its owner's hand. if you controlled that permanent, draw a card", parseEffects);
  assert.equal(bb[0].l7mark, true); assert.equal(bb[1].cnd.k, 'l11tgtMine');
  assert.deepEqual(l11Sentence('put x +1/+1 counters on each creature you control, where x is the number of shrines you control', parseEffects), [{ k: 'l11CtrEach', cnt: ['shrines'] }]);
  assert.deepEqual(l11Sentence('search your library for up to x basic land cards, where x is the number of shrines you control. put those cards onto the battlefield tapped, then shuffle', parseEffects), [{ k: 'ramp', n: 2, l11cnt: ['shrines'] }]);
  assert.deepEqual(l11Sentence('look at the top x cards of your library, where x is the number of lands you control. you may reveal a creature or land card from among them and put it into your hand. put the rest on the bottom of your library in a random order', parseEffects)[0].l11cnt, ['lands']);
  const vv = l11Sentence('choose target creature an opponent controls. tap it, then you may sacrifice an artifact or creature. if you do, put a stun counter on the chosen creature', parseEffects);
  assert.deepEqual(vv.map(o => o.k), ['l11TapT', 'cdMay']); assert.deepEqual(vv[1].ops, [{ k: 'l11StunLast' }]);
  assert.deepEqual(l11Sentence('if you attacked this turn, create a clue token', parseEffects), [{ k: 'avClue', n: 1, cnd: { k: 'l11attacked', text: 'you attacked this turn' } }]);
  assert.deepEqual(l11Sentence('until end of turn, ~ has base power 4 and gains trample', parseEffects), [{ k: 'l11Base', p: 4, kws: ['trample'] }]);
  assert.deepEqual(l11Sentence('create a 1/1 colorless spirit creature token with "~ can\'t block or be blocked by non-spirit creatures."', parseEffects), [{ k: 'l11SpiritTok' }]);
  assert.deepEqual(l11Sentence('put a +1/+1 counter on her', parseEffects), [{ k: 'selfCounters', n: 1 }]);
  assert.equal(l11Sentence('put a +1/+1 counter on target creature', parseEffects), null);
});

test('engine hooks', () => {
  // X from what you control and kicker are applied when the op resolves (and when the bot picks a target)
  assert.match(html, /if \(op\.l11cnt\) \{ op = Object\.assign\(\{\}, op, \{ n: \(op\.l11plus \|\| 0\) \+ l9Count\(op\.l11cnt, ctx\.seat\) \}\); delete op\.l11cnt; \}/);
  assert.match(html, /if \(op\.l11kick && ctx\.kicked\) \{ op = Object\.assign\(\{\}, op, \{ n: op\.l11kick \}\); \}/);
  // Spirit tokens; «can't be blocked as long as…»; Flopsie keeps only the first blocker
  assert.match(html, /if \(\(AB\(a\)\.l11SpiritOnly && !isType\(b, 'spirit'\)\) \|\| \(AB\(b\)\.l11SpiritOnly && !isType\(a, 'spirit'\)\)\) return false;/);
  assert.match(html, /for \(const b of bids\.slice\(1\)\) delete blocks\[b\];/);
  // Lost Days and Combustion Man: the owner / controller chooses
  assert.match(html, /CHWHO\.l11LostDays = \(s, op\) => \{ const c = G\.cards\[op\.id\]; return c && c\.zone === 'bf' \? \[c\.owner\] : \[\]; \};/);
  assert.match(html, /CHWHO\.l11Combustion = \(s, op\) => \{ const c = G\.cards\[op\.id\]; return c && c\.zone === 'bf' \? \[c\.ctl\] : \[\]; \};/);
});
