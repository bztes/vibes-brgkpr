import type { Repo } from '../db/schema.js';
import type { RepoType } from '#lib/repo-types.js';
import { borg } from './borg/index.js';
import { restic } from './restic/index.js';
import type { RepoBackend } from './types.js';

export type { HostKey, NewKeyValues, RepoBackend, ScanResult } from './types.js';

export const backends: Record<RepoType, RepoBackend> = { borg, restic };

export const backendOf = (r: Pick<Repo, 'type'>) => backends[r.type];

/** Starts all backends, see `RepoBackend.start`. */
export async function startBackends() {
	for (const b of Object.values(backends)) await b.start();
}

/** Call after keys, repositories, users or their settings changed. */
export async function syncAccess() {
	for (const b of Object.values(backends)) await b.syncAccess();
}
