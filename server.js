// Production entry point: adapter-node's server (build/index.js), with requests below /restic/
// routed to brgkpr's restic REST server (src/lib/server/backends/restic/server.ts) before they
// reach SvelteKit. restic uploads packs of up to 128 MiB, which neither SvelteKit's
// BODY_SIZE_LIMIT nor Node's 5 minute request timeout would let through on slow connections.
import { server } from './build/index.js';

// build/index.js waits for the app's init hook, which registers the handler
const restic = globalThis[Symbol.for('brgkpr.restic')];
if (typeof restic !== 'function') throw new Error('restic handler was not registered');

const [sveltekit] = server.listeners('request');
server.removeAllListeners('request');
server.on('request', (req, res) =>
	req.url?.startsWith('/restic/') ? restic(req, res) : sveltekit(req, res)
);

// large uploads take long; headersTimeout still protects against stalled requests
server.requestTimeout = 0;
