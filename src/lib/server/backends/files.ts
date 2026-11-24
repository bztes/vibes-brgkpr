import { mkdir, opendir, rm, stat } from 'node:fs/promises';
import { basename, join, resolve } from 'node:path';

/** Recursively sums the apparent size of all files below `dir`, 0 if it doesn't exist. */
export async function dirSize(dir: string): Promise<number> {
	let total = 0;
	let handle;
	try {
		handle = await opendir(dir);
	} catch {
		return 0;
	}
	for await (const entry of handle) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) total += await dirSize(full);
		else if (entry.isFile()) total += (await stat(full).catch(() => ({ size: 0 }))).size;
	}
	return total;
}

/** Newest mtime of the files in `dir` whose name matches `pattern`, 0 if there are none. */
export async function newestMtime(dir: string, pattern: RegExp) {
	let newest = 0;
	let handle;
	try {
		handle = await opendir(dir);
	} catch {
		return 0;
	}
	for await (const entry of handle) {
		if (entry.isFile() && pattern.test(entry.name)) {
			const { mtimeMs } = await stat(join(dir, entry.name));
			if (mtimeMs > newest) newest = mtimeMs;
		}
	}
	return newest;
}

export async function exists(path: string) {
	try {
		await stat(path);
		return true;
	} catch {
		return false;
	}
}

/** Paths are passed to forced SSH commands and must not need quoting. */
export function isSafePath(path: string) {
	return /^\/[A-Za-z0-9._\-/]*$/.test(path) && !path.split('/').includes('..');
}

export async function ensureDir(path: string) {
	await mkdir(path, { recursive: true, mode: 0o700 });
}

/** Removes a repository directory, with sanity checks against deleting anything else. */
export async function deleteRepoDir(path: string, expectedId: string, baseDirs: string[]) {
	const abs = resolve(path);
	if (basename(abs) !== expectedId) throw new Error('Path does not match the repository id');
	if (abs.split('/').filter(Boolean).length < 2) throw new Error('Unsafe path');
	if (baseDirs.some((b) => resolve(b) === abs))
		throw new Error('The base directory cannot be deleted');
	await rm(abs, { recursive: true, force: true });
}
