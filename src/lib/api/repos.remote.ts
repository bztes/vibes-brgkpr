import { error, invalid, redirect } from '@sveltejs/kit';
import { form, query } from '$app/server';
import * as v from 'valibot';
import { and, asc, eq } from 'drizzle-orm';
import { db } from '#lib/server/db/index.js';
import { accessKey, repo, user } from '#lib/server/db/schema.js';
import { hasPermission } from '#lib/permissions.js';
import { requireUser } from '#lib/server/auth.js';
import { getSettings } from '#lib/server/settings.js';
import {
	createRepo as create,
	deleteRepo as remove,
	findManagedRepo,
	rescan,
	toRepoView
} from '#lib/server/repos.js';
import { checkQuota } from '#lib/server/quota.js';
import { syncAccess } from '#lib/server/backends/index.js';
import { connectionLogOf, openConnectionCounts, recentActivity } from '#lib/server/connections.js';
import { createRepoSchema, repoAccessSettings, repoSettings } from '#lib/schemas.js';
import { displayName, gbToBytes } from '#lib/format.js';

export const getRepos = query(async () => {
	const u = requireUser();
	const s = await getSettings();
	const rows = await db.select().from(repo).where(eq(repo.userId, u.id)).orderBy(asc(repo.name));
	const keys = await db
		.select({ repoId: accessKey.repoId })
		.from(accessKey)
		.where(eq(accessKey.userId, u.id));
	const views = rows.map((r) => toRepoView(r, s));
	const ids = rows.map((r) => r.id);
	const open = await openConnectionCounts(ids);
	const activity = await recentActivity(ids, 14);
	return {
		repos: views.map((r) => ({
			...r,
			keyCount: keys.filter((k) => k.repoId === r.id).length,
			connectionCount: open.get(r.id) ?? 0,
			activity: activity.get(r.id) ?? []
		})),
		storageLimit: u.storageLimit,
		canCreate: hasPermission(u, 'repo:create')
	};
});

export const getRepo = query(v.string(), async (id) => {
	const u = requireUser();
	const s = await getSettings();
	const { repo: r, owner } = await findManagedRepo(u, id);
	return {
		...toRepoView(r, s),
		owner: { id: owner.id, name: displayName(owner), storageLimit: owner.storageLimit },
		isOwn: owner.id === u.id,
		/** recent client sessions, `endedAt` null = open right now */
		connections: (await connectionLogOf(r.id)).map((c) => ({
			id: c.id,
			keyId: c.keyId,
			client: c.client,
			startedAt: c.startedAt,
			endedAt: c.endedAt
		})),
		/** sessions of the last 30 days for the activity chart */
		activity: (await recentActivity([r.id], 30)).get(r.id) ?? [],
		// wiping the backup data on disk is irreversible, so only admins may do it
		canDeleteData: u.role === 'admin'
	};
});

export const createRepo = form(createRepoSchema, async (data, issue) => {
	const u = requireUser();
	const ownerId = data.ownerId || u.id;

	let owner = u;
	if (ownerId !== u.id) {
		// only admins may create repositories for other users
		if (u.role !== 'admin') error(403, 'Administrators only');
		const [target] = await db.select().from(user).where(eq(user.id, ownerId));
		if (!target) invalid(issue.ownerId('User not found'));
		owner = target;
	} else if (!hasPermission(u, 'repo:create')) {
		error(403, 'You are not allowed to create repositories – ask an administrator');
	}

	const [existing] = await db
		.select({ id: repo.id })
		.from(repo)
		.where(and(eq(repo.userId, owner.id), eq(repo.name, data.name)));
	if (existing) {
		invalid(
			issue.name(
				owner.id === u.id
					? 'You already have a repository with this name'
					: `${displayName(owner)} already has a repository with this name`
			)
		);
	}

	let created;
	try {
		created = await create(owner, {
			name: data.name,
			type: data.type,
			description: data.description || null,
			alertAfterHours: data.alertAfterHours || null
		});
	} catch (e) {
		invalid(`Could not create repository: ${e instanceof Error ? e.message : e}`);
	}
	redirect(303, `/repos/${created.id}`);
});

export const updateRepo = form(v.object({ id: v.string(), ...repoSettings }), async (data) => {
	const u = requireUser();
	const { repo: r } = await findManagedRepo(u, data.id);

	await db
		.update(repo)
		.set({
			description: data.description || null,
			alertAfterHours: data.alertAfterHours || null
		})
		.where(eq(repo.id, r.id));

	void getRepo(r.id).refresh();
	return { saved: true };
});

/** Append-only mode and quota of the repository, enforced by its backend. */
export const updateRepoAccess = form(
	v.object({ id: v.string(), ...repoAccessSettings }),
	async (data, issue) => {
		const u = requireUser();
		const { repo: r, owner } = await findManagedRepo(u, data.id);

		const quota = gbToBytes(data.quotaGb);
		const quotaError = checkQuota(owner, quota);
		if (quotaError) invalid(issue.quotaGb(quotaError));

		const [updated] = await db
			.update(repo)
			.set({
				appendOnly: data.appendOnly,
				quota,
				// re-evaluate the quota alert with the new quota
				alerts: quota === r.quota ? r.alerts : r.alerts.filter((a) => a !== 'quota')
			})
			.where(eq(repo.id, r.id))
			.returning();
		await syncAccess();
		if (quota !== r.quota) await rescan(updated);
		void getRepo(r.id).refresh();
		return { saved: true };
	}
);

export const deleteRepo = form(
	v.object({ id: v.string(), confirmName: v.string(), deleteData: v.optional(v.boolean(), false) }),
	async ({ id, confirmName, deleteData }, issue) => {
		const u = requireUser();
		const { repo: r, owner } = await findManagedRepo(u, id);
		if (deleteData && u.role !== 'admin') {
			error(403, 'Only administrators can delete backup data on disk');
		}
		if (confirmName.trim() !== r.name) invalid(issue.confirmName('Name does not match'));

		try {
			await remove(r, deleteData);
		} catch (e) {
			invalid(`Deletion failed: ${e instanceof Error ? e.message : e}`);
		}
		redirect(303, owner.id === u.id ? '/' : `/admin/repos?user=${owner.id}`);
	}
);
