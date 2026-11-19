import { eq } from 'drizzle-orm';
import { getRequestEvent } from '$app/server';
import { db } from './db/index.js';
import { setting } from './db/schema.js';
import { sanitizePermissions, type Permission } from '#lib/permissions.js';

export interface Settings {
	signupEnabled: boolean;
	/** permissions granted to self-registered accounts, and the default when creating users */
	defaultPermissions: Permission[];
	/** how often repositories are scanned for size / last backup and alerts are evaluated */
	scanIntervalMinutes: number;
	/** borg: public SSH port (host side of the container's port mapping); the host is the web UI's */
	sshPort: number;
	smtpHost: string;
	smtpPort: number;
	smtpSecure: boolean;
	smtpUser: string;
	smtpPassword: string;
	smtpFrom: string;
	/** public URL of the web UI: notification links and base of repository URLs (else the request's) */
	publicUrl: string;
}

export const defaults: Settings = {
	signupEnabled: true,
	defaultPermissions: ['repo:create'],
	scanIntervalMinutes: 5,
	sshPort: 2222,
	smtpHost: '',
	smtpPort: 587,
	smtpSecure: false,
	smtpUser: '',
	smtpPassword: '',
	smtpFrom: '',
	publicUrl: ''
};

export async function getSettings(): Promise<Settings> {
	const rows = await db.select().from(setting);
	const result: Settings = { ...defaults };
	for (const row of rows) {
		if (!(row.key in defaults)) continue;
		(result as unknown as Record<string, unknown>)[row.key] = JSON.parse(row.value);
	}
	result.defaultPermissions = sanitizePermissions(result.defaultPermissions);
	return result;
}

export async function getSetting<K extends keyof Settings>(key: K): Promise<Settings[K]> {
	const [row] = await db.select().from(setting).where(eq(setting.key, key));
	return row ? JSON.parse(row.value) : defaults[key];
}

export async function updateSettings(values: Partial<Settings>) {
	for (const [key, value] of Object.entries(values)) {
		if (value === undefined) continue;
		const json = JSON.stringify(value);
		await db
			.insert(setting)
			.values({ key, value: json })
			.onConflictDoUpdate({ target: setting.key, set: { value: json } });
	}
}

/** The configured public URL, else the origin SvelteKit derived for the current request. */
export function publicBase(s: Settings) {
	if (s.publicUrl) return s.publicUrl;
	try {
		return getRequestEvent().url.origin;
	} catch {
		return 'http://localhost:3000';
	}
}
