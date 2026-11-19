import { join, resolve } from 'node:path';
import { DATA_DIR, REPO_DIR } from '$app/env/private';
import { isSafePath } from './backends/files.js';

/** Everything brgkpr stores outside the repositories lives below DATA_DIR. */
export const dataDir = resolve(DATA_DIR);
/** repositories are created under REPO_DIR/<user>/<repo> */
export const repoDir = resolve(REPO_DIR);

export const databaseFile = join(dataDir, 'brgkpr.db');
export const authorizedKeysFile = join(dataDir, 'ssh', 'authorized_keys');
export const hostKeysDir = join(dataDir, 'ssh', 'host_keys');
/** brgkpr-serve reports borg sessions here */
export const sessionSocket = join(dataDir, 'brgkpr.sock');

/** forced SSH command, shipped next to the app (docker/brgkpr-serve) */
export const borgServeCommand = resolve('docker', 'brgkpr-serve');
export const migrationsDir = resolve('drizzle');

// both are written into the authorized_keys options
for (const path of [sessionSocket, borgServeCommand]) {
	if (!isSafePath(path))
		throw new Error(`unsafe path "${path}", choose a DATA_DIR without special characters`);
}
if (!isSafePath(repoDir))
	throw new Error(`unsafe path "${repoDir}", choose a REPO_DIR without special characters`);
