import { and, desc, eq, gte, inArray, isNull, lt } from 'drizzle-orm';
import { db } from './db/index.js';
import { accessKey, connectionLog, repo, user } from './db/schema.js';
import { evaluateStorageLimit, scanAndEvaluate } from './scanner.js';

/** how long ended sessions are kept in the log */
const RETENTION_DAYS = 90;

/** The most recent sessions of a repository; `endedAt` null = still open. */
export async function connectionLogOf(repoId: string, limit = 20) {
	return db
		.select()
		.from(connectionLog)
		.where(eq(connectionLog.repoId, repoId))
		.orderBy(desc(connectionLog.startedAt))
		.limit(limit);
}

/** Number of open sessions per repository. */
export async function openConnectionCounts(repoIds: string[]) {
	const rows = await db
		.select({ repoId: connectionLog.repoId })
		.from(connectionLog)
		.where(and(inArray(connectionLog.repoId, repoIds), isNull(connectionLog.endedAt)));
	const counts = new Map<string, number>();
	for (const r of rows) counts.set(r.repoId, (counts.get(r.repoId) ?? 0) + 1);
	return counts;
}

/** One client session in the backup history; `endedAt` null = open right now. */
export interface Activity {
	startedAt: Date;
	endedAt: Date | null;
}

/** Sessions of the last `days` days per repository, newest first. */
export async function recentActivity(repoIds: string[], days: number) {
	const byRepo = new Map<string, Activity[]>();
	if (repoIds.length === 0) return byRepo;
	const rows = await db
		.select({
			repoId: connectionLog.repoId,
			startedAt: connectionLog.startedAt,
			endedAt: connectionLog.endedAt
		})
		.from(connectionLog)
		.where(
			and(
				inArray(connectionLog.repoId, repoIds),
				gte(connectionLog.startedAt, new Date(Date.now() - days * 86_400_000))
			)
		)
		.orderBy(desc(connectionLog.startedAt));
	for (const { repoId, ...a } of rows) {
		const list = byRepo.get(repoId) ?? [];
		list.push(a);
		byRepo.set(repoId, list);
	}
	return byRepo;
}

/** Sessions don't survive a restart, so nothing can still be open at startup. */
export async function closeStaleSessions() {
	await db.update(connectionLog).set({ endedAt: new Date() }).where(isNull(connectionLog.endedAt));
}

export interface SessionStart {
	/** unique id chosen by the backend; starting the same session again is a no-op */
	id: string;
	repoId: string;
	keyId: string | null;
	/** IP address of the client */
	client: string | null;
}

/**
 * Logs a client session as open. Returns false if the repository doesn't exist. A key that
 * doesn't belong to the repository is not referenced.
 */
export async function startSession(s: SessionStart) {
	const [r] = await db.select({ id: repo.id }).from(repo).where(eq(repo.id, s.repoId));
	if (!r) return false;
	const [k] = s.keyId
		? await db
				.select({ id: accessKey.id })
				.from(accessKey)
				.where(and(eq(accessKey.id, s.keyId), eq(accessKey.repoId, r.id)))
		: [];
	// a session reported again (e.g. after an app restart) keeps its original start
	await db
		.insert(connectionLog)
		.values({
			id: s.id,
			repoId: r.id,
			keyId: k?.id ?? null,
			client: s.client,
			startedAt: new Date()
		})
		.onConflictDoNothing();
	return true;
}

/**
 * Marks a session as ended and rescans its repository, so size and last backup are up to date
 * right after every backup, prune or compact. Never throws.
 */
export async function endSession(id: string, repoId: string) {
	try {
		await db
			.update(connectionLog)
			.set({ endedAt: new Date() })
			.where(and(eq(connectionLog.id, id), eq(connectionLog.repoId, repoId)));
		await db
			.delete(connectionLog)
			.where(
				and(
					eq(connectionLog.repoId, repoId),
					lt(connectionLog.startedAt, new Date(Date.now() - RETENTION_DAYS * 86_400_000))
				)
			);

		const [row] = await db
			.select()
			.from(repo)
			.innerJoin(user, eq(repo.userId, user.id))
			.where(eq(repo.id, repoId));
		if (!row) return;
		await scanAndEvaluate(row.repo, row.user);
		await evaluateStorageLimit(row.user.id);
	} catch (e) {
		console.error(`[connections] ending session ${id} failed`, e);
	}
}
