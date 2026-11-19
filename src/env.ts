import { defineEnvVars } from '@sveltejs/kit/env';

const optional = (fallback: string) => (value: string | undefined) =>
	value === undefined || value === '' ? fallback : value;

export const variables = defineEnvVars({
	DATA_DIR: {
		description:
			'Directory for the database, SSH host keys, authorized_keys and the session socket.',
		schema: optional('./data')
	},
	REPO_DIR: {
		description: 'Directory below which repositories are created (<REPO_DIR>/<user>/<repo>).',
		schema: optional('./data/repos')
	}
});
