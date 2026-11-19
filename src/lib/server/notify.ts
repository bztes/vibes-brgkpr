import nodemailer from 'nodemailer';
import { db } from './db/index.js';
import {
	notificationLog,
	type NotificationChannel,
	type NotificationPrefs,
	type User
} from './db/schema.js';
import { notificationLevels, type NotificationLevel } from '#lib/notifications.js';
import { getSettings } from './settings.js';

export interface Notification {
	kind: 'stale' | 'recovered' | 'quota' | 'test';
	title: string;
	message: string;
	repoId?: string;
	priority?: 'default' | 'high';
}

const levelOf: Record<Exclude<Notification['kind'], 'test'>, NotificationLevel> = {
	stale: 'error',
	quota: 'warning',
	recovered: 'success'
};

async function sendMail(to: string, n: Notification) {
	const s = await getSettings();
	if (!s.smtpHost) throw new Error('SMTP is not configured');
	const transport = nodemailer.createTransport({
		host: s.smtpHost,
		port: s.smtpPort,
		secure: s.smtpSecure,
		auth: s.smtpUser ? { user: s.smtpUser, pass: s.smtpPassword } : undefined
	});
	const link = s.publicUrl ? `\n\n${s.publicUrl}` : '';
	await transport.sendMail({
		from: s.smtpFrom || s.smtpUser,
		to,
		subject: `[brgkpr] ${n.title}`,
		text: n.message + link
	});
}

/** Publishes to an ntfy topic URL (e.g. https://ntfy.sh/my-topic), optionally with an access token. */
async function sendNtfy(url: string, token: string | null | undefined, n: Notification) {
	const headers: Record<string, string> = {
		'Content-Type': 'text/plain; charset=utf-8',
		// RFC 2047 encoded so non-ASCII titles survive HTTP headers (supported by ntfy)
		Title: /^[\x20-\x7e]*$/.test(n.title)
			? n.title
			: `=?UTF-8?B?${Buffer.from(n.title).toString('base64')}?=`,
		Priority: n.priority === 'high' ? 'high' : 'default',
		Tags: n.kind === 'recovered' ? 'white_check_mark' : n.kind === 'test' ? 'bell' : 'warning'
	};
	if (token) headers.Authorization = `Bearer ${token}`;
	const s = await getSettings();
	if (s.publicUrl) headers.Click = s.publicUrl;
	const res = await fetch(url, {
		method: 'POST',
		headers,
		body: n.message,
		signal: AbortSignal.timeout(15_000)
	});
	if (!res.ok) throw new Error(`ntfy responded with ${res.status}`);
}

export const channelLabel = (c: NotificationChannel) =>
	c.name || (c.type === 'email' ? `Email (${c.address})` : `ntfy (${c.url})`);

function send(c: NotificationChannel, n: Notification) {
	switch (c.type) {
		case 'email':
			return sendMail(c.address, n);
		case 'ntfy':
			return sendNtfy(c.url, c.token, n);
	}
}

/**
 * Delivers a notification over all channels the user configured (or only `onlyChannelId`).
 * Never throws.
 */
export async function notifyUser(u: User, n: Notification, onlyChannelId?: string) {
	const results: { channel: string; ok: boolean; error?: string }[] = [];

	const level = n.kind === 'test' ? null : levelOf[n.kind];
	const all = u.notifications.channels ?? [];
	const channels = all.filter(
		(c) =>
			(!onlyChannelId || c.id === onlyChannelId) &&
			// test messages ignore the level filter
			(!level || (c.levels ?? notificationLevels).includes(level))
	);

	// the user muted this level everywhere – nothing to deliver, nothing to log
	if (all.length > 0 && channels.length === 0 && !onlyChannelId) return results;

	for (const c of channels) {
		const channel = channelLabel(c);
		try {
			await send(c, n);
			results.push({ channel, ok: true });
		} catch (e) {
			results.push({ channel, ok: false, error: e instanceof Error ? e.message : String(e) });
		}
	}

	const failed = results.filter((r) => !r.ok);
	await db.insert(notificationLog).values({
		userId: u.id,
		repoId: n.repoId ?? null,
		kind: n.kind,
		message: `${n.title}: ${n.message}`,
		success: results.length > 0 && failed.length === 0,
		error:
			results.length === 0
				? 'No notification service configured for this kind of notification'
				: failed.map((f) => `${f.channel}: ${f.error}`).join('; ') || null
	});

	return results;
}

/** Notification settings for a new account: email is enabled if an address was given. */
export const initialNotifications = (email: string | null | undefined): NotificationPrefs => ({
	channels: email
		? [
				{
					id: crypto.randomUUID(),
					type: 'email',
					name: '',
					address: email,
					levels: [...notificationLevels]
				}
			]
		: []
});
