import { readdir, readFile, realpath, stat, statfs } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { exists } from './backends/files.js';
import { repoDir } from './paths.js';

/** How often the disk's I/O counters are sampled. */
export const DISK_POLL_MS = 10_000;

export async function diskUsage(path: string) {
	try {
		const s = await statfs(path);
		return { total: s.blocks * s.bsize, free: s.bavail * s.bsize };
	} catch {
		return null;
	}
}

/*
 * Disk activity: tracks when the physical disk(s) behind the repository directory last read or
 * wrote, by polling the kernel's I/O counters in /sys/block/<disk>/stat. Reading sysfs never
 * touches the disk itself, so this shows whether something (e.g. the periodic scan) keeps the
 * disk from spinning down. It can't tell whether the disk actually is in standby, only how long
 * it has been idle.
 */

type Counters = { reads: number; writes: number; inFlight: number };

type Disk = {
	name: string;
	sysPath: string;
	model: string | null;
	rotational: boolean | null;
	last: Counters | null;
	lastReadAt: Date | null;
	lastWriteAt: Date | null;
};

/** Splits a Linux dev_t into major and minor number (glibc's encoding). */
function splitDev(dev: bigint) {
	const major = ((dev >> 8n) & 0xfffn) | ((dev >> 32n) & ~0xfffn);
	const minor = (dev & 0xffn) | ((dev >> 12n) & ~0xffn);
	return `${major}:${minor}`;
}

async function readText(path: string) {
	try {
		return (await readFile(path, 'utf8')).trim();
	} catch {
		return null;
	}
}

/**
 * Resolves a block device's sysfs directory to the whole disks it lives on: a partition maps to
 * its parent, device-mapper (LVM, LUKS) and md RAID map to the disks listed in `slaves/`.
 */
async function wholeDisks(sysPath: string, depth = 0): Promise<string[]> {
	if (depth > 8) return [];
	if (await exists(join(sysPath, 'partition'))) return wholeDisks(dirname(sysPath), depth + 1);
	const slaves = await readdir(join(sysPath, 'slaves')).catch(() => []);
	if (slaves.length === 0) return [sysPath];
	const nested = await Promise.all(
		slaves.map(async (s) => wholeDisks(await realpath(join(sysPath, 'slaves', s)), depth + 1))
	);
	return [...new Set(nested.flat())];
}

/** Fields of /sys/block/<disk>/stat, see Documentation/block/stat.rst. */
async function readCounters(sysPath: string): Promise<Counters | null> {
	const text = await readText(join(sysPath, 'stat'));
	if (!text) return null;
	const f = text.split(/\s+/).map(Number);
	// read I/Os, write I/Os, discard I/Os and flushes count as activity that keeps a disk awake
	return {
		reads: f[0],
		writes: f[4] + (f[11] ?? 0) + (f[15] ?? 0),
		inFlight: f[8]
	};
}

async function resolveDisks(dir: string): Promise<Disk[]> {
	const id = splitDev((await stat(dir, { bigint: true })).dev);
	if (id.startsWith('0:')) {
		throw new Error(
			'The repository directory is not on a single block device (e.g. btrfs, ZFS or a network share).'
		);
	}
	const sysPath = await realpath(`/sys/dev/block/${id}`).catch(() => {
		throw new Error(`Block device ${id} is not visible in /sys.`);
	});
	return Promise.all(
		(await wholeDisks(sysPath)).map(async (p) => {
			const [model, rotational, last] = await Promise.all([
				readText(join(p, 'device', 'model')),
				readText(join(p, 'queue', 'rotational')),
				readCounters(p)
			]);
			return {
				name: basename(p),
				sysPath: p,
				model: model || null,
				rotational: rotational == null ? null : rotational === '1',
				last,
				lastReadAt: null,
				lastWriteAt: null
			};
		})
	);
}

async function poll(disks: Disk[]) {
	const now = new Date();
	const counters = await Promise.all(disks.map((d) => readCounters(d.sysPath)));
	disks.forEach((d, i) => {
		const c = counters[i];
		if (!c) return;
		if (d.last) {
			if (c.reads !== d.last.reads) d.lastReadAt = now;
			if (c.writes !== d.last.writes) d.lastWriteAt = now;
		}
		d.last = c;
	});
}

let state: { since: Date; disks: Disk[] } | { error: string } | null = null;

/** Starts sampling the disk(s) behind the repository directory; never throws. */
export async function startDiskMonitor() {
	if (state) return;
	try {
		const disks = await resolveDisks(repoDir);
		state = { since: new Date(), disks };
		setInterval(() => {
			void poll(disks).catch((e) => console.error('[disk] polling failed', e));
		}, DISK_POLL_MS).unref();
	} catch (e) {
		state = { error: e instanceof Error ? e.message : String(e) };
	}
}

export function diskActivity() {
	if (!state) return { ok: false as const, reason: 'Disk monitor not started.' };
	if ('error' in state) return { ok: false as const, reason: state.error };
	return {
		ok: true as const,
		/** activity before this time is unknown */
		since: state.since,
		pollMs: DISK_POLL_MS,
		disks: state.disks.map(({ name, model, rotational, lastReadAt, lastWriteAt, last }) => ({
			name,
			model,
			rotational,
			lastReadAt,
			lastWriteAt,
			busy: (last?.inFlight ?? 0) > 0
		}))
	};
}
