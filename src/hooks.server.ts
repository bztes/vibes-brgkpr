import { redirect } from '@sveltejs/kit';
import type { Handle, ServerInit } from '@sveltejs/kit/hooks';
import { building } from '$app/env';
import { runMigrations } from '#lib/server/db/index.js';
import { SESSION_COOKIE, validateSessionToken } from '#lib/server/auth.js';
import { startBackends } from '#lib/server/backends/index.js';
import { startScanner } from '#lib/server/scanner.js';
import { closeStaleSessions } from '#lib/server/connections.js';

export const init: ServerInit = async () => {
	if (building) return;
	await runMigrations();
	await closeStaleSessions();
	await startBackends();
	startScanner();
};

const PUBLIC_ROUTES = ['/login', '/signup'];

export const handle: Handle = async ({ event, resolve }) => {
	const token = event.cookies.get(SESSION_COOKIE);
	event.locals.user = token ? await validateSessionToken(token) : null;

	// remote function requests do their own auth checks (see #lib/server/auth)
	if (!event.isRemoteRequest) {
		const path = event.url.pathname;
		const isPublic = PUBLIC_ROUTES.some((r) => path === r || path.startsWith(r + '/'));
		if (!event.locals.user && !isPublic) redirect(303, '/login');
		if (event.locals.user && isPublic) redirect(303, '/');
		if (path.startsWith('/admin') && event.locals.user?.role !== 'admin') redirect(303, '/');
	}

	return resolve(event);
};
