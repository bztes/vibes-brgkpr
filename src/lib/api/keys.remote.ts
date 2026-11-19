import { error, invalid } from '@sveltejs/kit';
import { form, query } from '$app/server';
import * as v from 'valibot';
import { and, eq, type SQL } from 'drizzle-orm';
import { db } from '#lib/server/db/index.js';
import { accessKey } from '#lib/server/db/schema.js';
import { requireUser } from '#lib/server/auth.js';
import { backendOf, syncAccess } from '#lib/server/backends/index.js';
import { findManagedRepo } from '#lib/server/repos.js';
import { addKeySchema, updateKeySchema } from '#lib/schemas.js';

/** Keys that can access the given repository (each key belongs to exactly one). */
export const getRepoKeys = query(v.string(), async (repoId) => {
	const u = requireUser();
	const { repo: r } = await findManagedRepo(u, repoId);
	const keys = await db
		.select()
		.from(accessKey)
		.where(eq(accessKey.repoId, repoId))
		.orderBy(accessKey.createdAt);
	const backend = backendOf(r);
	return keys.map((k) => ({
		id: k.id,
		name: k.name,
		detail: backend.describeKey(k),
		appendOnly: k.appendOnly,
		createdAt: k.createdAt
	}));
});

/** Server fingerprints to verify on first connect, if the backend has any. */
export const getHostKeys = query(v.string(), async (repoId) => {
	const u = requireUser();
	const { repo: r } = await findManagedRepo(u, repoId);
	return backendOf(r).hostKeys();
});

export const addKey = form(addKeySchema, async (data, issue) => {
	const u = requireUser();
	const { repo: r, owner } = await findManagedRepo(u, data.repoId);

	const values = backendOf(r).newKey({ publicKey: data.publicKey });
	if ('error' in values) invalid(issue.publicKey(values.error));

	if (values.publicKey) {
		const [existing] = await db
			.select({ id: accessKey.id })
			.from(accessKey)
			.where(eq(accessKey.publicKey, values.publicKey));
		if (existing) {
			invalid(
				issue.publicKey(
					'This key is already in use – each key can access only one repository, so create a separate key for it'
				)
			);
		}
	}

	const { defaultName, secret, ...stored } = values;
	const name = (data.name || defaultName).slice(0, 100);
	// the key belongs to the repository owner, also when an admin adds it
	const [created] = await db
		.insert(accessKey)
		.values({ ...stored, userId: owner.id, repoId: r.id, name, appendOnly: data.appendOnly })
		.returning();
	await syncAccess();
	void getRepoKeys(r.id).refresh();
	return { added: name, id: created.id, secret };
});

export const updateKey = form(updateKeySchema, async (data) => {
	const u = requireUser();
	const [key] = await db.select().from(accessKey).where(eq(accessKey.id, data.id));
	if (!key) error(404, 'Key not found');
	// 404s unless the user may manage the key's repository
	await findManagedRepo(u, key.repoId);

	await db
		.update(accessKey)
		.set({ name: data.name, appendOnly: data.appendOnly })
		.where(eq(accessKey.id, key.id));
	await syncAccess();
	void getRepoKeys(key.repoId).refresh();
	return { saved: true };
});

export const deleteKey = form(v.object({ id: v.string() }), async ({ id }) => {
	const u = requireUser();
	const where: SQL | undefined =
		u.role === 'admin'
			? eq(accessKey.id, id)
			: and(eq(accessKey.id, id), eq(accessKey.userId, u.id));
	const [deleted] = await db.delete(accessKey).where(where).returning();
	if (!deleted) error(404, 'Key not found');
	await syncAccess();
	void getRepoKeys(deleted.repoId).refresh();
});
