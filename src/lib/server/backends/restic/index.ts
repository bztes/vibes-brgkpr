import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import { dirSize, exists, newestMtime } from '../files.js';
import type { RepoBackend } from '../types.js';
import { publicBase } from '../../settings.js';
import { hashSecret, registerHandler, RESTIC_PREFIX } from './server.js';

/**
 * restic over HTTP(S): the app serves restic's REST protocol itself under /restic/ on the
 * port of the web UI (see ./server), checking
 * keys, append-only mode and quota from the database on every request.
 */
export const restic: RepoBackend = {
	type: 'restic',

	async start() {
		registerHandler();
	},

	// keys and settings are looked up per request
	async syncAccess() {},

	/** Every backup writes one file into `snapshots/`; `forget` removes them. */
	async scan(path) {
		if (!(await exists(path))) return { initialized: false, sizeBytes: 0, lastBackupAt: null };
		const last = await newestMtime(join(path, 'snapshots'), /^[0-9a-f]{64}$/);
		return {
			initialized: await exists(join(path, 'config')),
			sizeBytes: await dirSize(path),
			lastBackupAt: last ? new Date(last) : null
		};
	},

	/** Served by the web UI's own port, so the web UI's public URL is the base. */
	connectionUrl(r, s) {
		return `rest:${publicBase(s)}${RESTIC_PREFIX}${r.id}/`;
	},

	newKey() {
		const secret = randomBytes(24).toString('base64url');
		return {
			publicKey: null,
			fingerprint: null,
			secretHash: hashSecret(secret).toString('hex'),
			defaultName: 'restic client',
			secret
		};
	},

	describeKey(k) {
		return `username ${k.id}`;
	},

	async hostKeys() {
		return [];
	}
};
