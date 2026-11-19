/**
 * The backup tools brgkpr can host. Shared with the browser; the server side of each type is a
 * backend in #lib/server/backends.
 */
export const repoTypes = ['borg', 'restic'] as const;
export type RepoType = (typeof repoTypes)[number];

export interface RepoTypeInfo {
	label: string;
	/** one sentence for the type picker */
	hint: string;
	/** what an access key is for this type */
	key: { singular: string; plural: string };
	/** shown while the repository has not been initialized */
	initHint: string;
}

export const repoTypeInfo: Record<RepoType, RepoTypeInfo> = {
	borg: {
		label: 'Borg',
		hint: 'Over SSH, e.g. with Pika Backup, Vorta or borg.',
		key: { singular: 'SSH key', plural: 'SSH keys' },
		initHint: 'Run borg init or set up the repository in Pika Backup.'
	},
	restic: {
		label: 'restic',
		hint: 'Over HTTP(S) with the REST backend of restic, e.g. with restic, Backrest or resticprofile.',
		key: { singular: 'Access key', plural: 'Access keys' },
		initHint: 'Run restic init.'
	}
};
