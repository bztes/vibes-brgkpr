import { error, redirect } from '@sveltejs/kit';
import { getRequestEvent } from '$app/server';
import { and, eq, gt, lt, ne, or } from 'drizzle-orm';
import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { db } from './db/index.js';
import { session, user, type NotificationChannel, type User } from './db/schema.js';
import { hasPermission, permissionKeys } from '#lib/permissions.js';
import { displayName } from '#lib/format.js';

const scryptAsync = promisify(scrypt) as (
	password: string,
	salt: Buffer,
	keylen: number,
	options: { N: number; r: number; p: number; maxmem: number }
) => Promise<Buffer>;

const SCRYPT = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
const SESSION_DAYS = 30;
export const SESSION_COOKIE = 'brgkpr_session';

/** Which of the given email / username already belong to another account. */
export async function findTakenIdentity(
	identity: { email: string; username: string | null },
	exceptUserId?: string
) {
	const matches = await db
		.select({ email: user.email, username: user.username })
		.from(user)
		.where(
			and(
				identity.username
					? or(eq(user.email, identity.email), eq(user.username, identity.username))
					: eq(user.email, identity.email),
				exceptUserId ? ne(user.id, exceptUserId) : undefined
			)
		);
	return {
		email: matches.some((m) => m.email === identity.email),
		username: !!identity.username && matches.some((m) => m.username === identity.username)
	};
}

export async function hashPassword(password: string) {
	const salt = randomBytes(16);
	const hash = await scryptAsync(password, salt, 64, SCRYPT);
	return `scrypt$${salt.toString('base64')}$${hash.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string) {
	const [algo, saltB64, hashB64] = stored.split('$');
	if (algo !== 'scrypt' || !saltB64 || !hashB64) return false;
	const expected = Buffer.from(hashB64, 'base64');
	const actual = await scryptAsync(
		password,
		Buffer.from(saltB64, 'base64'),
		expected.length,
		SCRYPT
	);
	return timingSafeEqual(expected, actual);
}

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

export async function createSession(userId: string) {
	const token = randomBytes(32).toString('base64url');
	const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
	await db.insert(session).values({ id: hashToken(token), userId, expiresAt });

	const { cookies, url } = getRequestEvent();
	cookies.set(SESSION_COOKIE, token, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: url.protocol === 'https:',
		expires: expiresAt
	});
}

export async function destroySession() {
	const { cookies } = getRequestEvent();
	const token = cookies.get(SESSION_COOKIE);
	if (token) await db.delete(session).where(eq(session.id, hashToken(token)));
	cookies.delete(SESSION_COOKIE, { path: '/' });
}

export async function validateSessionToken(token: string): Promise<User | null> {
	const [row] = await db
		.select({ user })
		.from(session)
		.innerJoin(user, eq(session.userId, user.id))
		.where(and(eq(session.id, hashToken(token)), gt(session.expiresAt, new Date())));
	if (!row || row.user.disabled) return null;
	return row.user;
}

export async function deleteExpiredSessions() {
	await db.delete(session).where(lt(session.expiresAt, new Date()));
}

export async function deleteUserSessions(userId: string) {
	await db.delete(session).where(eq(session.userId, userId));
}

/** Use in query/form functions: redirects to /login if not logged in. */
export function requireUser(): User {
	const { locals } = getRequestEvent();
	if (!locals.user) redirect(303, '/login');
	return locals.user;
}

/** Use in command functions (redirect is not allowed there). */
export function requireUserStrict(): User {
	const { locals } = getRequestEvent();
	if (!locals.user) error(401, 'Not logged in');
	return locals.user;
}

export function requireAdmin(): User {
	const { locals } = getRequestEvent();
	if (!locals.user) error(401, 'Not logged in');
	if (locals.user.role !== 'admin') error(403, 'Administrators only');
	return locals.user;
}

/** Notification channel as sent to the browser – secrets are replaced by a flag. */
export type PublicNotificationChannel =
	| Extract<NotificationChannel, { type: 'email' }>
	| (Omit<Extract<NotificationChannel, { type: 'ntfy' }>, 'token'> & { hasToken: boolean });

export type PublicUser = Pick<
	User,
	'id' | 'username' | 'email' | 'role' | 'storageLimit' | 'permissions'
> & { name: string; notifications: { channels: PublicNotificationChannel[] } };

const toPublicChannel = (c: NotificationChannel): PublicNotificationChannel => {
	if (c.type !== 'ntfy') return c;
	const { token, ...rest } = c;
	return { ...rest, hasToken: !!token };
};

export const toPublicUser = (u: User): PublicUser => ({
	id: u.id,
	username: u.username,
	email: u.email,
	name: displayName(u),
	role: u.role,
	notifications: { channels: (u.notifications.channels ?? []).map(toPublicChannel) },
	storageLimit: u.storageLimit,
	/** effective permissions (admins have all) */
	permissions: permissionKeys.filter((p) => hasPermission(u, p))
});
