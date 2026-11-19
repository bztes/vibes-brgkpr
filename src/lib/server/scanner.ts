import { eq } from 'drizzle-orm';
import { backendOf, syncAccess } from './backends/index.js';
import { deleteExpiredSessions } from './auth.js';
import { db } from './db/index.js';
import { repo, user, type Repo, type RepoAlert, type User } from './db/schema.js';
import { notifyUser } from './notify.js';
import { getSetting } from './settings.js';
import { formatBytes, formatDateTime } from '#lib/format.js';

const QUOTA_WARN = 0.9;
const QUOTA_RESET = 0.85;

const locks = new Map<string, Promise<unknown>>();

/**
 * Runs `fn` after all earlier calls with the same key have finished, so e.g. a scan triggered
 * by the end of a session and the periodic scan never evaluate (and notify about) the same alert
 * at the same time.
 */
function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
	const next = (locks.get(key) ?? Promise.resolve()).catch(() => {}).then(fn);
	locks.set(key, next);
	void next
		.finally(() => {
			if (locks.get(key) === next) locks.delete(key);
		})
		.catch(() => {});
	return next;
}

/** Scans a single repository, updates the DB and sends alerts if needed. */
export function scanAndEvaluate(r: Repo, owner: User) {
	return withLock(`repo:${r.id}`, async () => {
		// re-read inside the lock, another scan may have changed the alerts in the meantime
		const [current] = await db.select().from(repo).where(eq(repo.id, r.id));
		return current ? scanLocked(current, owner) : r;
	});
}

async function scanLocked(r: Repo, owner: User) {
	let update: Partial<Repo>;
	try {
		const result = await backendOf(r).scan(r.path);
		update = { ...result, lastScanAt: new Date(), scanError: null };
	} catch (e) {
		update = { lastScanAt: new Date(), scanError: e instanceof Error ? e.message : String(e) };
	}

	const next = { ...r, ...update };
	Object.assign(update, await evaluateAlerts(next, owner));
	await db.update(repo).set(update).where(eq(repo.id, r.id));
	// borg quotas are baked into authorized_keys and depend on the sizes of all of the owner's repos
	if (next.sizeBytes !== r.sizeBytes || next.initialized !== r.initialized) {
		await syncAccess().catch((e) => console.error('[scanner] syncing access failed', e));
	}
	return { ...r, ...update };
}

/** Returns `list` with `kind` added or removed. */
function toggle<T>(list: T[], kind: T, active: boolean): T[] {
	const rest = list.filter((k) => k !== kind);
	return active ? [...rest, kind] : rest;
}

async function evaluateAlerts(r: Repo, owner: User): Promise<Partial<Repo>> {
	if (owner.disabled) return {};
	let alerts = r.alerts;
	const active = (kind: RepoAlert) => alerts.includes(kind);

	// missing backups
	if (r.alertAfterHours) {
		const reference = r.lastBackupAt ?? r.createdAt;
		const ageHours = (Date.now() - reference.getTime()) / 3_600_000;
		const stale = ageHours > r.alertAfterHours;

		if (stale && !active('stale')) {
			await notifyUser(owner, {
				kind: 'stale',
				repoId: r.id,
				priority: 'high',
				title: `No backup: ${r.name}`,
				message: r.lastBackupAt
					? `The repository "${r.name}" has not received a new backup for ${Math.floor(ageHours)} hours (last: ${formatDateTime(r.lastBackupAt)}).`
					: `The repository "${r.name}" has never received a backup.`
			});
			alerts = toggle(alerts, 'stale', true);
		} else if (!stale && active('stale')) {
			await notifyUser(owner, {
				kind: 'recovered',
				repoId: r.id,
				title: `Backups resumed: ${r.name}`,
				message: `The repository "${r.name}" has received a backup again (${formatDateTime(r.lastBackupAt!)}).`
			});
			alerts = toggle(alerts, 'stale', false);
		}
	} else {
		alerts = toggle(alerts, 'stale', false);
	}

	// quota usage
	const quota = r.quota;
	if (quota) {
		const usage = r.sizeBytes / quota;
		if (usage >= QUOTA_WARN && !active('quota')) {
			await notifyUser(owner, {
				kind: 'quota',
				repoId: r.id,
				priority: 'high',
				title: `Quota almost reached: ${r.name}`,
				message: `The repository "${r.name}" uses ${formatBytes(r.sizeBytes)} of ${formatBytes(quota)} (${Math.round(usage * 100)}%). Once the quota is reached, backups will fail.`
			});
			alerts = toggle(alerts, 'quota', true);
		} else if (usage < QUOTA_RESET && active('quota')) {
			alerts = toggle(alerts, 'quota', false);
		}
	} else {
		alerts = toggle(alerts, 'quota', false);
	}

	return alerts.length === r.alerts.length && alerts.every((a) => r.alerts.includes(a))
		? {}
		: { alerts };
}

/**
 * Warns the user once when all of their repositories together use 90% of their storage
 * limit (the pool enforced by the backends), and re-arms below 85%.
 */
export function evaluateStorageLimit(userId: string) {
	return withLock(`user:${userId}`, () => evaluateStorageLimitLocked(userId));
}

async function evaluateStorageLimitLocked(userId: string) {
	const [owner] = await db.select().from(user).where(eq(user.id, userId));
	if (!owner) return;

	const wasActive = owner.alerts.includes('storage');
	let active = wasActive;
	if (owner.storageLimit == null || owner.disabled) {
		active = false;
	} else {
		const repos = await db
			.select({ sizeBytes: repo.sizeBytes })
			.from(repo)
			.where(eq(repo.userId, owner.id));
		const used = repos.reduce((sum, r) => sum + r.sizeBytes, 0);
		const usage = used / owner.storageLimit;
		if (usage >= QUOTA_WARN && !wasActive) {
			await notifyUser(owner, {
				kind: 'quota',
				priority: 'high',
				title: 'Storage limit almost reached',
				message: `Your repositories use ${formatBytes(used)} of your storage limit of ${formatBytes(owner.storageLimit)} (${Math.round(usage * 100)}%). Once the limit is reached, backups to all of your repositories will fail.`
			});
			active = true;
		} else if (usage < QUOTA_RESET && wasActive) {
			active = false;
		}
	}

	if (active !== wasActive) {
		await db
			.update(user)
			.set({ alerts: toggle(owner.alerts, 'storage', active) })
			.where(eq(user.id, owner.id));
	}
}

let running: Promise<void> | null = null;

export function scanAll() {
	running ??= (async () => {
		try {
			const rows = await db.select().from(repo).innerJoin(user, eq(repo.userId, user.id));
			for (const row of rows) await scanAndEvaluate(row.repo, row.user);
			for (const userId of new Set(rows.map((row) => row.user.id))) {
				await evaluateStorageLimit(userId);
			}
			await deleteExpiredSessions();
		} catch (e) {
			console.error('[scanner] scan failed', e);
		} finally {
			running = null;
		}
	})();
	return running;
}

let timer: ReturnType<typeof setTimeout> | undefined;

/** Schedules the next periodic scan; the interval is re-read every time so changes apply at once. */
function schedule(delay?: number) {
	clearTimeout(timer);
	void (async () => {
		const ms = delay ?? (await getSetting('scanIntervalMinutes')) * 60_000;
		clearTimeout(timer);
		timer = setTimeout(async () => {
			await scanAll();
			schedule();
		}, ms);
		timer.unref?.();
	})().catch((e) => console.error('[scanner] scheduling failed', e));
}

let started = false;

export function startScanner() {
	if (started) return;
	started = true;
	schedule(5_000);
}

/** Call after the interval setting changed. */
export function rescheduleScanner() {
	if (started) schedule();
}
