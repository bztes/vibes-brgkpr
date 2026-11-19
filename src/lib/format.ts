/** The name shown for a user: their username, or their email if they have none. */
export const displayName = (u: { username: string | null; email: string }) => u.username ?? u.email;

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];

export function formatBytes(bytes: number | null | undefined) {
	if (bytes == null) return '–';
	if (bytes < 1000) return `${bytes} B`;
	let value = bytes;
	let i = 0;
	while (value >= 1000 && i < UNITS.length - 1) {
		value /= 1000;
		i++;
	}
	return `${value.toLocaleString('en-US', { maximumFractionDigits: value < 10 ? 2 : 1 })} ${UNITS[i]}`;
}

export const GB = 1_000_000_000;

export const bytesToGb = (bytes: number | null | undefined) =>
	bytes == null ? undefined : Math.round((bytes / GB) * 100) / 100;

export const gbToBytes = (gb: number | null | undefined) =>
	gb == null || gb <= 0 ? null : Math.round(gb * GB);

export function formatDateTime(date: Date | null | undefined) {
	if (!date) return 'never';
	return date.toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' });
}

/** Duration between two dates, e.g. "45 s", "12 min", "2 h 5 min". */
export function formatDuration(from: Date, to: Date) {
	const s = Math.max(0, Math.round((to.getTime() - from.getTime()) / 1000));
	if (s < 60) return `${s} s`;
	const min = Math.round(s / 60);
	if (min < 60) return `${min} min`;
	return `${Math.floor(min / 60)} h ${min % 60} min`;
}

/** Short duration like "3 h", "2 d", "45 min" for countdowns. */
export function formatSpan(ms: number) {
	const min = Math.round(Math.abs(ms) / 60_000);
	if (min < 60) return `${min} min`;
	const h = Math.round(min / 60);
	if (h < 48) return `${h} h`;
	return `${Math.round(h / 24)} days`;
}

export function formatRelative(date: Date | null | undefined, now = Date.now()) {
	if (!date) return 'never';
	const diff = (now - date.getTime()) / 1000;
	const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
	if (Math.abs(diff) < 60) return 'just now';
	if (Math.abs(diff) < 3600) return rtf.format(-Math.round(diff / 60), 'minute');
	if (Math.abs(diff) < 86400) return rtf.format(-Math.round(diff / 3600), 'hour');
	return rtf.format(-Math.round(diff / 86400), 'day');
}
