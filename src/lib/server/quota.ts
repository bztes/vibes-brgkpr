import { and, eq, ne, sum } from 'drizzle-orm';
import { db } from './db/index.js';
import { repo, type Repo, type User } from './db/schema.js';

/**
 * Checks a requested repository quota. The owner's storage limit is a pool shared by all of
 * their repositories, so a repository quota is only an additional cap and may not exceed the
 * limit. Returns an error message or null.
 */
export function checkQuota(owner: Pick<User, 'storageLimit'>, quota: number | null) {
	if (quota == null || owner.storageLimit == null) return null;
	if (quota > owner.storageLimit) {
		return `The quota cannot exceed the owner's storage limit of ${(owner.storageLimit / 1e9).toFixed(2)} GB`;
	}
	return null;
}

/**
 * The most a repository may grow to right now: the lower of its own quota and the owner's
 * storage limit minus the size of their other repositories (as last scanned). null = unlimited.
 */
export async function quotaFor(
	r: Pick<Repo, 'id' | 'userId' | 'quota'>,
	owner: Pick<User, 'storageLimit'>
) {
	let others = 0;
	if (owner.storageLimit != null) {
		const [row] = await db
			.select({ others: sum(repo.sizeBytes) })
			.from(repo)
			.where(and(eq(repo.userId, r.userId), ne(repo.id, r.id)));
		others = Number(row.others ?? 0);
	}
	return effectiveQuota(r.quota, owner.storageLimit, others);
}

/**
 * The lower of a repository's own quota and what the owner's storage limit leaves after
 * `othersBytes` (the size of their other repositories). null = unlimited.
 */
export function effectiveQuota(
	quota: number | null,
	storageLimit: number | null,
	othersBytes: number
) {
	const candidates = quota != null ? [quota] : [];
	if (storageLimit != null) candidates.push(storageLimit - othersBytes);
	return candidates.length ? Math.min(...candidates) : null;
}
