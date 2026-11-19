import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vitest/config';
import { playwright } from '@vitest/browser-playwright';
import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import type { Plugin } from 'vite';

type Handler = (req: unknown, res: unknown) => void;
const resticHandler = () =>
	(globalThis as Record<symbol, Handler | undefined>)[Symbol.for('brgkpr.restic')];

/**
 * Dev counterpart of server.js: routes /restic/ to the app's restic REST server before
 * SvelteKit sees the request. SvelteKit runs its init hook (which registers the handler) on the
 * first request, so that is triggered first if needed.
 */
function restic(): Plugin {
	return {
		name: 'brgkpr-restic',
		configureServer(server) {
			server.httpServer?.on('listening', () => {
				if (server.httpServer && 'requestTimeout' in server.httpServer)
					server.httpServer.requestTimeout = 0;
			});
			server.middlewares.use(async (req, res, next) => {
				if (!req.url?.startsWith('/restic/')) return next();
				if (!resticHandler()) await fetch(`http://${req.headers.host}/login`).catch(() => {});
				const handler = resticHandler();
				if (!handler) {
					res.statusCode = 503;
					return res.end('Starting up\n');
				}
				handler(req, res);
			});
		}
	};
}

export default defineConfig({
	plugins: [
		restic(),
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true,
				experimental: { async: true }
			},
			adapter: adapter(),
			experimental: { remoteFunctions: true }
		})
	],
	test: {
		expect: { requireAssertions: true },
		projects: [
			{
				extends: './vite.config.ts',
				test: {
					name: 'client',
					browser: {
						enabled: true,
						provider: playwright(),
						instances: [{ browser: 'chromium', headless: true }]
					},
					include: ['src/**/*.svelte.{test,spec}.{js,ts}'],
					exclude: ['src/lib/server/**']
				}
			},

			{
				extends: './vite.config.ts',
				test: {
					name: 'server',
					environment: 'node',
					include: ['src/**/*.{test,spec}.{js,ts}'],
					exclude: ['src/**/*.svelte.{test,spec}.{js,ts}']
				}
			}
		]
	}
});
