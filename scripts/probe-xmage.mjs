import {openNexusProbe} from '../server/xmage-probe.mjs';

const username = process.env.XMAGE_PROBE_USER;
const password = process.env.XMAGE_PROBE_PASSWORD;
if (!username || !password) {
  console.error('Set XMAGE_PROBE_USER and XMAGE_PROBE_PASSWORD for a dedicated local test account.');
  process.exit(2);
}
let probe;
try {
  probe = await openNexusProbe({timeout:30000});
  await probe.request('ping');
  await probe.request('connect', {username,password});
  await probe.request('getServerInfo');
  for (const action of ['getGameTypes','getDeckTypes','getPlayerTypes']) await probe.request(action);
  await probe.request('disconnect');
  console.log('Nexus local handshake, login and capability requests succeeded.');
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally { probe?.close(); }
