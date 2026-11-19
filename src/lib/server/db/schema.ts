import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import type { Permission } from '../../permissions.js';
import type { NotificationLevel } from '../../notifications.js';
import { repoTypes, type RepoType } from '../../repo-types.js';

interface ChannelBase {
	id: string;
	name: string;
	/** which kinds of notifications are delivered over this channel */
	levels: NotificationLevel[];
}

/** Per-user notification channels. New channel types are added here, not as new columns. */
export type NotificationChannel =
	| (ChannelBase & { type: 'email'; address: string })
	| (ChannelBase & { type: 'ntfy'; url: string; token?: string | null });

export type NotificationChannelType = NotificationChannel['type'];

export interface NotificationPrefs {
	channels: NotificationChannel[];
}

/** Alerts that are currently "active" (sent once, re-armed when the condition clears). */
export type UserAlert = 'storage';
export type RepoAlert = 'stale' | 'quota';

const id = () =>
	text('id')
		.primaryKey()
		.$defaultFn(() => crypto.randomUUID());

const createdAt = () =>
	integer('created_at', { mode: 'timestamp' })
		.notNull()
		.default(sql`(unixepoch())`);

export const user = sqliteTable('user', {
	id: id(),
	/** login, stored lowercased */
	email: text('email').notNull().unique(),
	/** optional display name, see #lib/format displayName */
	username: text('username').unique(),
	passwordHash: text('password_hash').notNull(),
	role: text('role', { enum: ['admin', 'user'] })
		.notNull()
		.default('user'),
	disabled: integer('disabled', { mode: 'boolean' }).notNull().default(false),
	/** granted permissions, see #lib/permissions (admins implicitly have all) */
	permissions: text('permissions', { mode: 'json' })
		.$type<Permission[]>()
		.notNull()
		.default(sql`'[]'`),
	/** total storage limit across all repos in bytes, null = unlimited (set by admin) */
	storageLimit: integer('storage_limit'),
	/** active alerts, e.g. "storage limit almost reached" was sent */
	alerts: text('alerts', { mode: 'json' })
		.$type<UserAlert[]>()
		.notNull()
		.default(sql`'[]'`),
	notifications: text('notifications', { mode: 'json' })
		.$type<NotificationPrefs>()
		.notNull()
		.default(sql`'{"channels":[]}'`),
	createdAt: createdAt()
});

export const session = sqliteTable('session', {
	/** sha256 of the session token */
	id: text('id').primaryKey(),
	userId: text('user_id')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' }),
	expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull()
});

/**
 * A credential that grants access to exactly one repository. What it consists of depends on
 * the repository type: borg uses an SSH public key, restic a generated password (HTTP basic
 * auth with the key id as username).
 */
export const accessKey = sqliteTable('access_key', {
	id: id(),
	userId: text('user_id')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' }),
	name: text('name').notNull(),
	/** the one repository this key may access */
	repoId: text('repo_id')
		.notNull()
		.references(() => repo.id, { onDelete: 'cascade' }),
	/** SSH keys: "<type> <base64>" without comment */
	publicKey: text('public_key').unique(),
	/** SSH keys: SHA256 fingerprint */
	fingerprint: text('fingerprint'),
	/** passwords: sha256 of the generated (high-entropy) password */
	secretHash: text('secret_hash'),
	/** this key may only add data, in addition to the repository's own append-only mode */
	appendOnly: integer('append_only', { mode: 'boolean' }).notNull().default(false),
	createdAt: createdAt()
});

export const repo = sqliteTable(
	'repo',
	{
		id: id(),
		userId: text('user_id')
			.notNull()
			.references(() => user.id, { onDelete: 'cascade' }),
		name: text('name').notNull(),
		description: text('description'),
		/** backup tool, selects the backend in #lib/server/backends */
		type: text('type', { enum: repoTypes }).$type<RepoType>().notNull().default('borg'),
		/** absolute path on disk, fixed at creation time */
		path: text('path').notNull().unique(),
		/** no key can delete data */
		appendOnly: integer('append_only', { mode: 'boolean' }).notNull().default(false),
		/** storage quota in bytes, null = none (the owner's storage limit still applies) */
		quota: integer('quota'),
		/** alert if there was no backup for this many hours, null = disabled */
		alertAfterHours: integer('alert_after_hours'),

		// scan results
		initialized: integer('initialized', { mode: 'boolean' }).notNull().default(false),
		sizeBytes: integer('size_bytes').notNull().default(0),
		lastBackupAt: integer('last_backup_at', { mode: 'timestamp' }),
		lastScanAt: integer('last_scan_at', { mode: 'timestamp' }),
		scanError: text('scan_error'),

		/** active alerts (sent once, re-armed when the condition clears) */
		alerts: text('alerts', { mode: 'json' })
			.$type<RepoAlert[]>()
			.notNull()
			.default(sql`'[]'`),

		createdAt: createdAt()
	},
	(t) => [uniqueIndex('repo_user_name').on(t.userId, t.name)]
);

export const setting = sqliteTable('setting', {
	key: text('key').primaryKey(),
	value: text('value').notNull()
});

export const notificationLog = sqliteTable('notification_log', {
	id: id(),
	userId: text('user_id')
		.notNull()
		.references(() => user.id, { onDelete: 'cascade' }),
	repoId: text('repo_id').references(() => repo.id, { onDelete: 'set null' }),
	kind: text('kind').notNull(),
	message: text('message').notNull(),
	success: integer('success', { mode: 'boolean' }).notNull(),
	error: text('error'),
	createdAt: createdAt()
});

/** Client sessions of a repository, reported by the backends (see #lib/server/connections) */
export const connectionLog = sqliteTable(
	'connection_log',
	{
		/** session id generated by the backend */
		id: text('id').primaryKey(),
		repoId: text('repo_id')
			.notNull()
			.references(() => repo.id, { onDelete: 'cascade' }),
		keyId: text('key_id').references(() => accessKey.id, { onDelete: 'set null' }),
		/** IP address of the client */
		client: text('client'),
		startedAt: integer('started_at', { mode: 'timestamp' }).notNull(),
		/** null = still open */
		endedAt: integer('ended_at', { mode: 'timestamp' })
	},
	(t) => [index('connection_log_repo').on(t.repoId, t.startedAt)]
);

export type User = typeof user.$inferSelect;
export type Repo = typeof repo.$inferSelect;
export type AccessKey = typeof accessKey.$inferSelect;
export type ConnectionLogEntry = typeof connectionLog.$inferSelect;
