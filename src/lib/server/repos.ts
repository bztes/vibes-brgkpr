import { error } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { join, resolve } from 'node:path';
import { db } from './db/index.js';
import { accessKey, repo, user, type Repo, type User } from './db/schema.js';
import { backendOf, syncAccess } from './backends/index.js';
import { deleteRepoDir, ensureDir, isSafePath } from './backends/files.js';
import { type Settings } from './settings.js';
import { repoDir } from './paths.js';
import { evaluateStorageLimit, scanAndEvaluate } from './scanner.js';

export function toRepoView(r: Repo, s: Settings) {
	return {
		id: r.id,
		name: r.name,
		type: r.type,
		description: r.description,
		url: backendOf(r).connectionUrl(r, s),
		quota: r.quota,
		appendOnly: r.appendOnly,
		alertAfterHours: r.alertAfterHours,
		initialized: r.initialized,
		sizeBytes: r.sizeBytes,
		lastBackupAt: r.lastBackupAt,
		lastScanAt: r.lastScanAt,
		scanError: r.scanError,
		createdAt: r.createdAt
	};
}

export type RepoView = ReturnType<typeof toRepoView>;

/**
 * Loads a repository the given user may manage – their own, or any if they are an admin –
 * together with its owner. 404s otherwise.
 */
export async function findManagedRepo(u: Pick<User, 'id' | 'role'>, id: string) {
	const [row] = await db
		.select({ repo, owner: user })
		.from(repo)
		.innerJoin(user, eq(repo.userId, user.id))
		.where(u.role === 'admin' ? eq(repo.id, id) : and(eq(repo.id, id), eq(repo.userId, u.id)));
	if (!row) error(404, 'Repository not found');
	return row;
}

export async function createRepo(
	owner: User,
	values: Pick<Repo, 'name' | 'type' | 'description' | 'alertAfterHours'>
) {
	const id = crypto.randomUUID();
	const path = resolve(join(repoDir, owner.id, id));
	if (!isSafePath(path)) throw new Error('The resulting path contains invalid characters');

	await ensureDir(path);
	const [created] = await db
		.insert(repo)
		.values({ ...values, id, userId: owner.id, path })
		.returning();
	await syncAccess();
	return created;
}

export async function deleteRepo(r: Repo, deleteData: boolean) {
	// every key belongs to exactly one repository
	await db.delete(accessKey).where(eq(accessKey.repoId, r.id));
	await db.delete(repo).where(eq(repo.id, r.id));
	await syncAccess();
	if (deleteData) {
		await deleteRepoDir(r.path, r.id, [repoDir, join(repoDir, r.userId)]);
	}
}

export async function rescan(r: Repo) {
	const [owner] = await db.select().from(user).where(eq(user.id, r.userId));
	const result = await scanAndEvaluate(r, owner);
	await evaluateStorageLimit(owner.id);
	return result;
}
