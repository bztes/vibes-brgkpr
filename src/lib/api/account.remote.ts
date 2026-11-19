import { error, invalid } from '@sveltejs/kit';
import { command, form, query } from '$app/server';
import * as v from 'valibot';
import { desc, eq } from 'drizzle-orm';
import { db } from '#lib/server/db/index.js';
import { notificationLog, user, type NotificationChannel } from '#lib/server/db/schema.js';
import { notificationLevels } from '#lib/notifications.js';
import {
	findTakenIdentity,
	hashPassword,
	requireUser,
	requireUserStrict,
	verifyPassword
} from '#lib/server/auth.js';
import { notifyUser } from '#lib/server/notify.js';
import { email, optionalEmail, optionalUsername, password } from '#lib/schemas.js';
import { displayName } from '#lib/format.js';
import { getMe } from './auth.remote.js';

export const updateProfile = form(
	v.object({ email, username: optionalUsername }),
	async ({ email, username }, issue) => {
		const u = requireUser();
		const taken = await findTakenIdentity({ email, username: username || null }, u.id);
		if (taken.email) invalid(issue.email('An account with this email already exists'));
		if (taken.username) invalid(issue.username('Username is already taken'));
		await db
			.update(user)
			.set({ email, username: username || null })
			.where(eq(user.id, u.id));
		void getMe().refresh();
		return { saved: true };
	}
);

const httpUrl = (s: string) => /^https?:\/\/\S+$/.test(s);

/** Adds a notification channel (empty `id`) or updates an existing one. */
export const saveNotificationChannel = form(
	v.object({
		id: v.optional(v.string(), ''),
		type: v.picklist(['email', 'ntfy'], 'Choose a service'),
		name: v.pipe(v.optional(v.string(), ''), v.trim(), v.maxLength(100)),
		address: optionalEmail,
		url: v.pipe(v.optional(v.string(), ''), v.trim()),
		_token: v.pipe(v.optional(v.string(), ''), v.trim()),
		clearToken: v.optional(v.boolean(), false),
		levels: v.optional(v.array(v.picklist(notificationLevels)), [])
	}),
	async (data, issue) => {
		const u = requireUser();
		const channels = [...(u.notifications.channels ?? [])];
		const index = data.id ? channels.findIndex((c) => c.id === data.id) : -1;
		if (data.id && index === -1) error(404, 'Notification service not found');
		const existing = index === -1 ? undefined : channels[index];
		const id = existing?.id ?? crypto.randomUUID();

		let channel: NotificationChannel;
		if (data.type === 'email') {
			if (!data.address) invalid(issue.address('Email address is required'));
			channel = { id, type: 'email', name: data.name, levels: data.levels, address: data.address };
		} else {
			if (!httpUrl(data.url)) invalid(issue.url('Must be an http(s) URL'));
			const oldToken = existing?.type === 'ntfy' ? existing.token : null;
			channel = {
				id,
				type: 'ntfy',
				name: data.name,
				levels: data.levels,
				url: data.url,
				token: data._token || (data.clearToken ? null : (oldToken ?? null))
			};
		}

		if (index === -1) channels.push(channel);
		else channels[index] = channel;

		await db
			.update(user)
			.set({ notifications: { ...u.notifications, channels } })
			.where(eq(user.id, u.id));
		void getMe().refresh();
		return { saved: true, id };
	}
);

export const deleteNotificationChannel = command(v.string(), async (id) => {
	const u = requireUserStrict();
	const channels = (u.notifications.channels ?? []).filter((c) => c.id !== id);
	await db
		.update(user)
		.set({ notifications: { ...u.notifications, channels } })
		.where(eq(user.id, u.id));
	void getMe().refresh();
});

export const changePassword = form(
	v.pipe(
		v.object({ _current: v.string(), _password: password, _passwordConfirm: v.string() }),
		v.forward(
			v.partialCheck(
				[['_password'], ['_passwordConfirm']],
				(d) => d._password === d._passwordConfirm,
				'Passwords do not match'
			),
			['_passwordConfirm']
		)
	),
	async ({ _current, _password }, issue) => {
		const u = requireUser();
		if (!(await verifyPassword(_current, u.passwordHash))) {
			invalid(issue._current('Current password is incorrect'));
		}
		await db
			.update(user)
			.set({ passwordHash: await hashPassword(_password) })
			.where(eq(user.id, u.id));
		return { saved: true };
	}
);

/** Sends a test message over all channels, or only the given one. */
export const sendTestNotification = command(v.optional(v.string()), async (channelId) => {
	const u = requireUserStrict();
	// re-read so freshly saved settings are used
	const [fresh] = await db.select().from(user).where(eq(user.id, u.id));
	const results = await notifyUser(
		fresh,
		{
			kind: 'test',
			title: 'Test notification',
			message: `Hi ${displayName(fresh)}, your brgkpr notifications are working.`
		},
		channelId
	);
	if (results.length === 0) error(400, 'No notification service configured');
	void getNotificationLog().refresh();
	return results;
});

export const getNotificationLog = query(async () => {
	const u = requireUser();
	return db
		.select()
		.from(notificationLog)
		.where(eq(notificationLog.userId, u.id))
		.orderBy(desc(notificationLog.createdAt))
		.limit(20);
});
