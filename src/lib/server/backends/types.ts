import type { AccessKey, Repo } from '../db/schema.js';
import type { Settings } from '../settings.js';
import type { RepoType } from '#lib/repo-types.js';

export interface ScanResult {
	/** the client has created the repository (borg init / restic init) */
	initialized: boolean;
	sizeBytes: number;
	lastBackupAt: Date | null;
}

/** Values of a new access key, as stored in the database. */
export type NewKeyValues = Pick<AccessKey, 'publicKey' | 'fingerprint' | 'secretHash'> & {
	/** name to use if the user left it empty */
	defaultName: string;
	/** shown to the user once, never stored */
	secret?: string;
};

export interface HostKey {
	type: string;
	fingerprint: string;
}

/**
 * Everything that differs between the backup tools. The rest of the app (repositories, keys,
 * scans, alerts, connection log, quotas) is shared and only talks to backends through this.
 *
 * Settings shared by all backends live in the database: append-only mode and quota of the
 * repository, append-only mode of each key and the owner's storage limit. Each backend has to
 * enforce them, the quota being the lower of the repository quota and what is left of the
 * owner's storage limit (see `quotaFor` in #lib/server/quota).
 */
export interface RepoBackend {
	readonly type: RepoType;

	/** Called once at startup, e.g. to start listening for clients. */
	start(): Promise<void>;

	/**
	 * Applies changes of keys, repositories, users or settings, e.g. by regenerating a config
	 * file. Backends that look everything up per connection do nothing.
	 */
	syncAccess(): Promise<void>;

	/** Inspects the repository on disk. */
	scan(path: string): Promise<ScanResult>;

	/** URL clients use to reach the repository. */
	connectionUrl(r: Repo, s: Settings): string;

	/** Validates the input for a new key. Returns an error message for the `publicKey` field. */
	newKey(input: { publicKey: string }): NewKeyValues | { error: string };

	/** One line identifying a key in the UI, e.g. its fingerprint. */
	describeKey(k: AccessKey): string;

	/** Fingerprints of the server, so users can verify them on first connect. */
	hostKeys(): Promise<HostKey[]>;
}
