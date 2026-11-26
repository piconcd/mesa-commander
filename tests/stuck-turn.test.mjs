import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../app/index.html', import.meta.url), 'utf8').replace(/\r\n/g, '\n');

function gameLoopSource() {
  const begin = html.indexOf('async function gameLoop()');
  const end = html.indexOf('function saveCheckpoint()', begin);
  assert.ok(begin >= 0 && end > begin);
  return html.slice(begin, end);
}

test('an internal error in a turn is logged and the game moves on', () => {
  const loop = gameLoopSource();
  // the turn itself and both end-of-turn bot steps are protected
  assert.equal((loop.match(/x27TurnError\(s, e\)/g) || []).length, 3);
  // aborting or resetting the game still stops the loop
  assert.equal((loop.match(/if \(e === ABORT \|\| G !== g \|\| g\.killed\) throw e;/g) || []).length, 3);
  // an older loop stops after every step once «Forzar a seguir» started a new one
  assert.equal((loop.match(/g\.loopGen !== gen/g) || []).length, 3);
  assert.match(loop, /while \(\(G === g && !g\.killed && g\.loopGen === gen\)/);
  assert.match(html, /function x27TurnError\(s, e\) \{[\s\S]*?La partida sigue con el siguiente jugador/);
});

test('a hung bot turn offers «Forzar a seguir» to the human players', () => {
  assert.match(html, /\(function x27Watchdog\(\) \{/);
  assert.match(html, /Date\.now\(\) - lastT > 25000/);
  assert.match(html, /data-act="x27unstick">Forzar a seguir<\/button>/);
  assert.match(html, /case 'x27unstick': x27Unstick\(\); break;/);
  assert.match(html, /function x27Unstick\(\) \{[\s\S]*?asSeat\(homeSeat\(\), gameLoop\);/);
});

test('the top bar warns about pause and pending effects', () => {
  assert.match(html, /\.tb-warn\{/);
  assert.match(html, /Partida en pausa: los bots esperan/);
  assert.match(html, /data-act="presolve" data-id="\$\{UI\.prompts\[0\]\.id\}">Resolver<\/button>/);
});

test('Fandaniel lets each opponent choose between sacrificing and losing life', () => {
  assert.match(html, /CHGEN\.fxFandaniel = function\* \(s, op, ctx\)/);
  assert.match(html, /labels: \['Sacrificar una criatura', `Perder \$\{n\} vidas`\]/);
  assert.match(html, /XOPS\.fxFandaniel = function \(op, ctx\) \{ chGo\('fxFandaniel', ctx\.seat, op, ctx\); \};/);
  // the override is defined after the older automatic version, so it wins
  assert.ok(html.indexOf('CHGEN.fxFandaniel') > html.indexOf('  fxFandaniel(op, ctx) {'));
});
