import test from 'node:test';
import assert from 'node:assert/strict';
import {openNexusProbe} from '../server/xmage-probe.mjs';

class FakeSocket extends EventTarget {
  static current;
  sent = [];
  constructor(url) {
    super();
    FakeSocket.current = this;
    assert.equal(url, 'ws://127.0.0.1:8787');
    queueMicrotask(() => this.frame({type:'connected'}));
  }
  frame(data) { this.dispatchEvent(new MessageEvent('message', {data:JSON.stringify(data)})); }
  send(data) { this.sent.push(JSON.parse(data)); }
  close() { this.dispatchEvent(new Event('close')); }
}
test('Nexus requests use correlated results and ignore game events', async () => {
  const p = await openNexusProbe({Socket:FakeSocket});
  try {
    const s = FakeSocket.current;
    const a = p.request('getGameTypes');
    const b = p.request('getPlayerTypes');
    const [first, second] = s.sent;
    s.frame({type:'event', method:'GAME_UPDATE', requestId:first.requestId, data:{private:true}});
    s.frame({type:'result', requestId:second.requestId, ok:true, data:['HUMAN']});
    s.frame({type:'result', requestId:first.requestId, ok:true, data:['Commander']});
    assert.deepEqual(await a, ['Commander']);
    assert.deepEqual(await b, ['HUMAN']);
  } finally { p.close(); }
});
test('probe forces local server and rejects mutating game actions', async () => {
  const p = await openNexusProbe({Socket:FakeSocket});
  try {
    const s = FakeSocket.current;
    await assert.rejects(p.request('createTable'), /Unsupported/);
    const login = p.request('connect', {host:'external.invalid', port:1, username:'probe', password:'test'});
    const req = s.sent[0];
    assert.deepEqual(req.args, {host:'127.0.0.1',port:17171,username:'probe',password:'test'});
    s.frame({type:'result',requestId:req.requestId,ok:false,errorCode:'VERSION_MISMATCH'});
    await assert.rejects(login, /VERSION_MISMATCH/);
  } finally { p.close(); }
});
test('timeout rejects pending requests and closes the probe', async () => {
  const p = await openNexusProbe({Socket:FakeSocket,timeout:25});
  await assert.rejects(p.request('ping'), /timeout/);
  await assert.rejects(p.request('ping'), /not connected/);
});
