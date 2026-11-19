import { readFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { dirSize, exists, newestMtime } from '../files.js';
import type { RepoBackend } from '../types.js';
import { publicBase } from '../../settings.js';
import { hostKeyFingerprints, parsePublicKey, repoRoot, syncAuthorizedKeys } from './ssh.js';
import { listenForSessions } from './socket.js';

/** The container's sshd only admits this user (docker/sshd_config: AllowUsers). */
const SSH_USER = 'borg';

/** A repository counts as initialized once `borg init` has written its config. */
async function isInitialized(path: string) {
	try {
		return /^\[repository\]/m.test(await readFile(join(path, 'config'), 'utf8'));
	} catch {
		return false;
	}
}

/**
 * Borg over SSH: sshd runs `borg serve` through the brgkpr-serve wrapper for each key (see
 * ./ssh), which enforces append-only mode and quota and reports sessions (see ./socket).
 */
export const borg: RepoBackend = {
	type: 'borg',

	async start() {
		await syncAuthorizedKeys();
		await listenForSessions();
	},

	syncAccess: syncAuthorizedKeys,

	/**
	 * Borg writes `index.N` / `hints.N` / `integrity.N` on every committed transaction, so their
	 * newest mtime is the time of the last write (backup, prune or compact).
	 */
	async scan(path) {
		if (!(await exists(path))) return { initialized: false, sizeBytes: 0, lastBackupAt: null };
		const last = await newestMtime(path, /^(index|hints|integrity)\.\d+$/);
		return {
			initialized: await isInitialized(path),
			sizeBytes: await dirSize(path),
			lastBackupAt: last ? new Date(last) : null
		};
	},

	/**
	 * brgkpr-serve changes into the owner's directory (see `repoRoot`) before starting borg, so
	 * the URL only contains the repository's directory name, its id (`/./` = relative to the
	 * current directory).
	 */
	connectionUrl(r, s) {
		const port = s.sshPort === 22 ? '' : `:${s.sshPort}`;
		return `ssh://${SSH_USER}@${new URL(publicBase(s)).hostname}${port}/./${relative(repoRoot(r.path), r.path)}`;
	},

	newKey({ publicKey }) {
		const parsed = parsePublicKey(publicKey);
		if (!parsed) return { error: 'Invalid public key – expected e.g. "ssh-ed25519 AAAA… comment"' };
		return {
			publicKey: parsed.publicKey,
			fingerprint: parsed.fingerprint,
			secretHash: null,
			// fall back to the key's comment (usually user@host), then to the short fingerprint
			defaultName: parsed.comment || parsed.fingerprint.slice(0, 19)
		};
	},

	describeKey(k) {
		return `${k.publicKey?.split(' ')[0] ?? 'ssh'} · ${k.fingerprint ?? ''}`;
	},

	hostKeys: hostKeyFingerprints
};
