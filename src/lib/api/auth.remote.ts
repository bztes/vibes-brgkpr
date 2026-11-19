import { invalid, redirect } from '@sveltejs/kit';
import { form, getRequestEvent, query } from '$app/server';
import { count, eq } from 'drizzle-orm';
import { db } from '#lib/server/db/index.js';
import { user } from '#lib/server/db/schema.js';
import {
	createSession,
	destroySession,
	findTakenIdentity,
	hashPassword,
	toPublicUser,
	verifyPassword
} from '#lib/server/auth.js';
import { getSetting, getSettings, updateSettings } from '#lib/server/settings.js';
import { loginSchema, signupSchema } from '#lib/schemas.js';
import { initialNotifications } from '#lib/server/notify.js';

export const getMe = query(async () => {
	const { locals } = getRequestEvent();
	return locals.user ? toPublicUser(locals.user) : null;
});

async function userCount() {
	const [{ n }] = await db.select({ n: count() }).from(user);
	return n;
}

export const getSignupStatus = query(async () => {
	const firstUser = (await userCount()) === 0;
	return { firstUser, enabled: firstUser || (await getSetting('signupEnabled')) };
});

// a dummy hash so that unknown emails take as long as wrong passwords
const dummyHash = hashPassword('dummy-password-for-timing');

export const login = form(loginSchema, async ({ email, _password }) => {
	const [u] = await db.select().from(user).where(eq(user.email, email));
	const ok = await verifyPassword(_password, u?.passwordHash ?? (await dummyHash));
	if (!u || !ok) invalid('Incorrect email or password');
	if (u.disabled) invalid('This account is disabled');

	await createSession(u.id);
	redirect(303, '/');
});

export const signup = form(signupSchema, async ({ email, username, _password }, issue) => {
	const firstUser = (await userCount()) === 0;
	const s = await getSettings();
	if (!firstUser && !s.signupEnabled) {
		invalid('Registration is currently closed');
	}

	const taken = await findTakenIdentity({ email, username: username || null });
	if (taken.email) invalid(issue.email('An account with this email already exists'));
	if (taken.username) invalid(issue.username('Username is already taken'));

	const [created] = await db
		.insert(user)
		.values({
			email,
			username: username || null,
			notifications: initialNotifications(email),
			passwordHash: await hashPassword(_password),
			role: firstUser ? 'admin' : 'user',
			permissions: s.defaultPermissions
		})
		.returning();

	// the first account becomes admin and closes the registration
	if (firstUser) await updateSettings({ signupEnabled: false });

	await createSession(created.id);
	redirect(303, '/');
});

export const logout = form(async () => {
	await destroySession();
	redirect(303, '/login');
});
