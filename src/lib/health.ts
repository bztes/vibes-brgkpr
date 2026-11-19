/** Shared logic that decides whether a repository's backups are running normally. */

import { repoTypeInfo, type RepoType } from './repo-types.js';

export type HealthLevel = 'ok' | 'warning' | 'error' | 'pending';

export interface Health {
	level: HealthLevel;
	label: string;
	/** one sentence explaining the state */
	detail: string;
}

export interface HealthInput {
	type: RepoType;
	initialized: boolean;
	lastBackupAt: Date | null;
	alertAfterHours: number | null;
	quota: number | null;
	sizeBytes: number;
	scanError?: string | null;
	keyCount?: number;
}

/** Without a configured warning, a repository counts as overdue after a week. */
const DEFAULT_ALERT_HOURS = 24 * 7;

const HOUR = 3_600_000;

/** When the next backup has to arrive at the latest; null if there was none yet. */
export function backupDeadline(r: Pick<HealthInput, 'lastBackupAt' | 'alertAfterHours'>) {
	if (!r.lastBackupAt) return null;
	return new Date(r.lastBackupAt.getTime() + (r.alertAfterHours ?? DEFAULT_ALERT_HOURS) * HOUR);
}

export function repoHealth(r: HealthInput, now = Date.now()): Health {
	if (r.scanError) {
		return { level: 'error', label: 'Scan failed', detail: r.scanError };
	}
	if (r.quota && r.sizeBytes >= r.quota * 0.9) {
		return {
			level: 'warning',
			label: 'Quota almost full',
			detail: `${Math.round((r.sizeBytes / r.quota) * 100)}% of the quota is used. New backups may fail soon.`
		};
	}
	const info = repoTypeInfo[r.type];
	if (r.keyCount === 0) {
		return {
			level: 'pending',
			label: `No ${info.key.singular.toLowerCase()}`,
			detail: `Add ${info.key.singular.toLowerCase()} for the computer that backs up here.`
		};
	}
	if (!r.initialized) {
		return { level: 'pending', label: 'Not initialized', detail: info.initHint };
	}
	if (!r.lastBackupAt) {
		return { level: 'pending', label: 'No backup yet', detail: 'Waiting for the first backup.' };
	}
	const deadline = backupDeadline(r)!;
	if (now > deadline.getTime()) {
		return {
			level: 'error',
			label: 'Backup overdue',
			detail: r.alertAfterHours
				? `Expected a backup at least every ${r.alertAfterHours} h.`
				: 'No backup for more than a week.'
		};
	}
	return { level: 'ok', label: 'Healthy', detail: 'Backups arrive on schedule.' };
}

/** Problems first, then repositories waiting for setup, then healthy ones. */
export const severity: Record<HealthLevel, number> = { error: 0, warning: 1, pending: 2, ok: 3 };
