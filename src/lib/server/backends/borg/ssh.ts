import { createHash } from 'node:crypto';
import { chmod, mkdir, readdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { authorizedKeysFile, borgServeCommand, hostKeysDir, sessionSocket } from '../../paths.js';
import { db } from '../../db/index.js';
import { accessKey, repo, user, type Repo } from '../../db/schema.js';
import { effectiveQuota } from '../../quota.js';
import { isSafePath } from '../files.js';
import type { HostKey } from '../types.js';

const KEY_TYPES = new Set([
	'ssh-ed25519',
	'ssh-rsa',
	'ecdsa-sha2-nistp256',
	'ecdsa-sha2-nistp384',
	'ecdsa-sha2-nistp521',
	'sk-ssh-ed25519@openssh.com',
	'sk-ecdsa-sha2-nistp256@openssh.com'
]);

export interface ParsedKey {
	publicKey: string;
	comment: string;
	fingerprint: string;
}

/** Parses an OpenSSH public key line. Returns null if invalid. */
export function parsePublicKey(input: string): ParsedKey | null {
	const parts = input.trim().split(/\s+/);
	if (parts.length < 2) return null;
	const [type, b64, ...rest] = parts;
	if (!KEY_TYPES.has(type) || !/^[A-Za-z0-9+/]+={0,2}$/.test(b64)) return null;

	const blob = Buffer.from(b64, 'base64');
	if (blob.length < 4) return null;
	const len = blob.readUInt32BE(0);
	if (blob.subarray(4, 4 + len).toString('ascii') !== type) return null;

	const fingerprint =
		'SHA256:' + createHash('sha256').update(blob).digest('base64').replace(/=+$/, '');

	return { publicKey: `${type} ${b64}`, comment: rest.join(' '), fingerprint };
}

/**
 * Directory a repository lives in: repositories are created at `<base>/<user id>/<repo id>`,
 * so this is the owner's directory and clients address the repository by its id alone.
 * Derived from the stored path, so repos keep working after REPO_DIR changes.
 */
export function repoRoot(path: string) {
	return dirname(path);
}

/** borg rejects quotas below 10M (0 means unlimited) */
const MIN_QUOTA = 10 * 1000 * 1000;

let running: Promise<void> = Promise.resolve();
let queued: Promise<void> | null = null;

/**
 * Regenerates the authorized_keys file. Every key grants access to exactly one borg
 * repository. Its forced command is the `brgkpr-serve` wrapper (docker/brgkpr-serve), which
 * changes into the repository root (see `repoRoot`) and runs
 * `borg serve --restrict-to-repository=<repo> [--append-only] [--storage-quota=<quota>]`.
 * It reports the open connection to the app, which rescans the repository once it ends
 * (`--notify`, see ./socket).
 *
 * The quota is computed here from the repository quota and the owner's storage limit, which
 * is shared by all of their repositories of any type, using the sizes of the last scan. The
 * scanner calls this whenever a size changes, so the file stays current.
 *
 * Calls are serialized so concurrent changes can't interleave. Calls made while a write is
 * still waiting to start share that write: it reads the database once it starts.
 */
export function syncAuthorizedKeys() {
	queued ??= running
		.catch(() => {})
		.then(() => {
			queued = null;
			return writeAuthorizedKeys();
		});
	running = queued;
	return queued;
}

/**
 * Quota passed to borg serve, null = none. Not passed until the repository is initialized:
 * `borg init` would persist it into the repository config.
 */
function borgQuota(target: Repo, owner: { storageLimit: number | null }, ownerRepos: Repo[]) {
	if (!target.initialized) return null;
	const others = ownerRepos.reduce((n, r) => (r.id === target.id ? n : n + r.sizeBytes), 0);
	const quota = effectiveQuota(target.quota || null, owner.storageLimit, others);
	// rounding up lets a tiny repo exceed a full pool by at most MIN_QUOTA
	return quota == null ? null : Math.max(MIN_QUOTA, quota);
}

async function writeAuthorizedKeys() {
	const users = await db
		.select({
			id: user.id,
			disabled: user.disabled,
			storageLimit: user.storageLimit
		})
		.from(user);
	const keys = await db.select().from(accessKey);
	const repos = await db.select().from(repo);

	const lines = ['# Managed by brgkpr - DO NOT EDIT. This file is regenerated automatically.'];

	for (const u of users) {
		if (u.disabled) continue;
		const ownerRepos = repos.filter((r) => r.userId === u.id);

		for (const key of keys.filter((k) => k.userId === u.id && k.publicKey)) {
			// never emit a key without a valid repository: borg serve without --restrict-* grants full access
			const target = ownerRepos.find(
				(r) => r.id === key.repoId && r.type === 'borg' && isSafePath(r.path)
			);
			if (!target) continue;

			const quota = borgQuota(target, u, ownerRepos);
			const command = [
				borgServeCommand,
				`--root=${repoRoot(target.path)}`,
				`--repo=${target.path}`,
				...(target.appendOnly || key.appendOnly ? ['--append-only'] : []),
				...(quota != null ? [`--quota=${quota}`] : []),
				`--key=${key.id}`,
				`--notify=${sessionSocket}`
			].join(' ');
			lines.push(`command="${command}",restrict ${key.publicKey} brgkpr:${u.id}:${key.id}`);
		}
	}

	const file = authorizedKeysFile;
	await mkdir(dirname(file), { recursive: true, mode: 0o700 });
	const tmp = `${file}.tmp-${process.pid}`;
	await writeFile(tmp, lines.join('\n') + '\n', { mode: 0o600 });
	await chmod(tmp, 0o600);
	await rename(tmp, file);
}

/** Fingerprints of the sshd host keys (written by the container entrypoint). */
export async function hostKeyFingerprints(): Promise<HostKey[]> {
	const dir = hostKeysDir;
	try {
		const files = (await readdir(dir)).filter((f) => f.endsWith('.pub'));
		const keys = await Promise.all(files.map((f) => readFile(join(dir, f), 'utf8')));
		return keys
			.map((k) => parsePublicKey(k))
			.filter((k) => k !== null)
			.map((k) => ({ type: k.publicKey.split(' ')[0], fingerprint: k.fingerprint }));
	} catch {
		return [];
	}
}
