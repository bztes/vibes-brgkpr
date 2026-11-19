import { error, invalid, redirect } from '@sveltejs/kit';
import { form, query } from '$app/server';
import * as v from 'valibot';
import { asc, count, eq, sql, sum } from 'drizzle-orm';
import { db } from '#lib/server/db/index.js';
import { accessKey, repo, user } from '#lib/server/db/schema.js';
import {
	deleteUserSessions,
	findTakenIdentity,
	hashPassword,
	requireAdmin
} from '#lib/server/auth.js';
import { diskUsage } from '#lib/server/backends/files.js';
import { repoDir } from '#lib/server/paths.js';
import { syncAccess } from '#lib/server/backends/index.js';
import { deleteRepo, toRepoView } from '#lib/server/repos.js';
import { rescheduleScanner } from '#lib/server/scanner.js';
import { openConnectionCounts, recentActivity } from '#lib/server/connections.js';
import { getSettings, updateSettings } from '#lib/server/settings.js';
import { email, optionalUsername, password } from '#lib/schemas.js';
import { displayName, gbToBytes } from '#lib/format.js';
import { permissionKeys, sanitizePermissions } from '#lib/permissions.js';
import { initialNotifications } from '#lib/server/notify.js';

/** sort users by their display name */
const userSortKey = sql`coalesce(${user.username}, ${user.email})`;

const permissions = v.optional(v.array(v.picklist(permissionKeys)), []);

export const getUsers = query(async () => {
	requireAdmin();
	const users = await db.select().from(user).orderBy(asc(userSortKey));
	const repoStats = await db
		.select({ userId: repo.userId, repos: count(), size: sum(repo.sizeBytes) })
		.from(repo)
		.groupBy(repo.userId);
	const keyStats = await db
		.select({ userId: accessKey.userId, keys: count() })
		.from(accessKey)
		.groupBy(accessKey.userId);

	return users.map((u) => {
		const r = repoStats.find((s) => s.userId === u.id);
		return {
			id: u.id,
			username: u.username,
			email: u.email,
			name: displayName(u),
			role: u.role,
			disabled: u.disabled,
			permissions: sanitizePermissions(u.permissions),
			storageLimit: u.storageLimit,
			createdAt: u.createdAt,
			repos: r?.repos ?? 0,
			sizeBytes: Number(r?.size ?? 0),
			keys: keyStats.find((s) => s.userId === u.id)?.keys ?? 0
		};
	});
});

export const getUser = query(v.string(), async (id) => {
	const u = (await getUsers()).find((u) => u.id === id);
	if (!u) error(404, 'User not found');
	return u;
});

export const createUser = form(
	v.object({
		email,
		username: optionalUsername,
		_password: password,
		role: v.picklist(['user', 'admin']),
		permissions
	}),
	async (data, issue) => {
		requireAdmin();
		const username = data.username || null;
		const taken = await findTakenIdentity({ email: data.email, username });
		if (taken.email) invalid(issue.email('An account with this email already exists'));
		if (taken.username) invalid(issue.username('Username is already taken'));

		const [created] = await db
			.insert(user)
			.values({
				email: data.email,
				username,
				notifications: initialNotifications(data.email),
				passwordHash: await hashPassword(data._password),
				role: data.role,
				permissions: data.permissions
			})
			.returning({ id: user.id });
		redirect(303, `/admin/users/${created.id}`);
	}
);

async function adminCount() {
	const [{ n }] = await db.select({ n: count() }).from(user).where(eq(user.role, 'admin'));
	return n;
}

export const updateUser = form(
	v.object({
		id: v.string(),
		role: v.picklist(['user', 'admin']),
		disabled: v.optional(v.boolean(), false),
		permissions,
		storageLimitGb: v.optional(v.pipe(v.number(), v.minValue(0)))
	}),
	async ({ id, role, disabled, permissions, storageLimitGb }) => {
		const me = requireAdmin();
		const [target] = await db.select().from(user).where(eq(user.id, id));
		if (!target) error(404, 'User not found');

		if (target.id === me.id && (role !== 'admin' || disabled)) {
			invalid('You cannot remove your own admin rights or disable yourself');
		}
		if (target.role === 'admin' && role !== 'admin' && (await adminCount()) <= 1) {
			invalid('There must be at least one administrator');
		}

		const storageLimit = gbToBytes(storageLimitGb);
		await db
			.update(user)
			.set({
				role,
				disabled,
				permissions,
				storageLimit,
				// re-evaluate the storage limit alert with the new limit
				alerts:
					storageLimit === target.storageLimit
						? target.alerts
						: target.alerts.filter((a) => a !== 'storage')
			})
			.where(eq(user.id, id));
		if (disabled) await deleteUserSessions(id);
		// the backends enforce both
		if (disabled !== target.disabled || storageLimit !== target.storageLimit) await syncAccess();
		void getUser(id).refresh();
		return { saved: true };
	}
);

export const resetPassword = form(
	v.object({ id: v.string(), _password: password }),
	async ({ id, _password }) => {
		requireAdmin();
		await db
			.update(user)
			.set({ passwordHash: await hashPassword(_password) })
			.where(eq(user.id, id));
		await deleteUserSessions(id);
		return { saved: true };
	}
);

export const deleteUser = form(
	v.object({ id: v.string(), confirmName: v.string(), deleteData: v.optional(v.boolean(), false) }),
	async ({ id, confirmName, deleteData }, issue) => {
		const me = requireAdmin();
		const [target] = await db.select().from(user).where(eq(user.id, id));
		if (!target) error(404, 'User not found');
		if (target.id === me.id) invalid('You cannot delete yourself');
		if (confirmName.trim().toLowerCase() !== displayName(target))
			invalid(issue.confirmName('Name does not match'));

		const repos = await db.select().from(repo).where(eq(repo.userId, id));
		for (const r of repos) await deleteRepo(r, deleteData);
		await db.delete(user).where(eq(user.id, id));
		await syncAccess();
		redirect(303, '/admin/users');
	}
);

/** All repositories of all users, for the admin overview. */
export const getAllRepos = query(async () => {
	requireAdmin();
	const s = await getSettings();
	const rows = await db
		.select({ repo, owner: { id: user.id, username: user.username, email: user.email } })
		.from(repo)
		.innerJoin(user, eq(repo.userId, user.id))
		.orderBy(asc(userSortKey), asc(repo.name));
	const keyStats = await db
		.select({ repoId: accessKey.repoId, keys: count() })
		.from(accessKey)
		.groupBy(accessKey.repoId);
	const views = rows.map((row) => toRepoView(row.repo, s));
	const ids = rows.map((row) => row.repo.id);
	const open = await openConnectionCounts(ids);
	const activity = await recentActivity(ids, 14);
	return rows.map(({ repo: r, owner }, i) => ({
		...views[i],
		owner: { id: owner.id, name: displayName(owner) },
		keyCount: keyStats.find((k) => k.repoId === r.id)?.keys ?? 0,
		connectionCount: open.get(r.id) ?? 0,
		activity: activity.get(r.id) ?? []
	}));
});

export const getAdminSettings = query(async () => {
	requireAdmin();
	const s = await getSettings();
	return {
		...s,
		smtpPassword: '',
		smtpPasswordSet: s.smtpPassword !== '',
		disk: await diskUsage(repoDir)
	};
});

export const updateGeneralSettings = form(
	v.object({
		signupEnabled: v.optional(v.boolean(), false),
		defaultPermissions: permissions,
		scanIntervalMinutes: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(1440)),
		publicUrl: v.pipe(
			v.optional(v.string(), ''),
			v.trim(),
			v.check(
				(u) => u === '' || /^https?:\/\/[^/]/.test(u),
				'Must start with https:// (or http://)'
			),
			v.transform((u) => u.replace(/\/+$/, ''))
		)
	}),
	async (data) => {
		requireAdmin();
		await updateSettings(data);
		rescheduleScanner();
		void getAdminSettings().refresh();
		return { saved: true };
	}
);

export const updateBorgSettings = form(
	v.object({
		sshPort: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(65535))
	}),
	async (data) => {
		requireAdmin();
		await updateSettings(data);
		void getAdminSettings().refresh();
		return { saved: true };
	}
);

export const updateSmtpSettings = form(
	v.object({
		smtpHost: v.pipe(v.optional(v.string(), ''), v.trim()),
		smtpPort: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(65535)),
		smtpSecure: v.optional(v.boolean(), false),
		smtpUser: v.pipe(v.optional(v.string(), ''), v.trim()),
		_smtpPassword: v.optional(v.string(), ''),
		smtpFrom: v.pipe(v.optional(v.string(), ''), v.trim())
	}),
	async ({ _smtpPassword, ...data }) => {
		requireAdmin();
		// an empty password field keeps the stored password
		await updateSettings(_smtpPassword ? { ...data, smtpPassword: _smtpPassword } : data);
		void getAdminSettings().refresh();
		return { saved: true };
	}
);
