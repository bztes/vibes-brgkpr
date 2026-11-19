import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { link, mkdir, open, readdir, stat, unlink } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { dirname, join } from 'node:path';
import { eq } from 'drizzle-orm';
import { db } from '../../db/index.js';
import { accessKey, repo, user, type AccessKey, type Repo, type User } from '../../db/schema.js';
import { endSession, startSession } from '../../connections.js';
import { quotaFor } from '../../quota.js';
import { dirSize } from '../files.js';

/**
 * The REST protocol of restic (https://restic.readthedocs.io/en/stable/100_references.html#rest-backend),
 * served directly by the app under `/restic/` instead of a separate rest-server, so it can
 * enforce everything per key from the database. The files on disk use the layout of restic's local backend, so
 * `restic -r <path>` also works on the server.
 *
 * - Authentication: HTTP basic auth, username = id of the access key, password = its secret.
 *   A key only grants access to its own repository (`/restic/<repo id>/…`).
 * - Append-only (repository or key): nothing but locks can be deleted. Files can never be
 *   overwritten, like rest-server does.
 * - Quota: uploads that would exceed `quotaFor` are rejected with 413. Locks are exempt, so a
 *   full repository can still be locked for `forget --prune`.
 * - Sessions: HTTP has none, so requests of one key from one client form a session, which
 *   ends when the client removes its last lock (end of a restic command) or after
 *   `IDLE_TIMEOUT` without requests.
 */

const TYPES = new Set(['data', 'keys', 'locks', 'snapshots', 'index']);
const NAME = /^[0-9a-f]{64}$/;
const V1 = 'application/vnd.x.restic.rest.v1';
const V2 = 'application/vnd.x.restic.rest.v2';
/** restic refreshes its locks every 5 minutes */
const IDLE_TIMEOUT = 10 * 60_000;

export const hashSecret = (secret: string) => createHash('sha256').update(secret).digest();

interface Context {
	key: AccessKey;
	repo: Repo;
	owner: User;
	session: Session;
}

export const RESTIC_PREFIX = '/restic/';

/**
 * Handles a request below `RESTIC_PREFIX`. These requests bypass SvelteKit (body size limit,
 * request timeout, login redirect): server.js (production) and the dev plugin in
 * vite.config.ts route them here, see `registerHandler`.
 */
export function handleRequest(req: IncomingMessage, res: ServerResponse) {
	handle(req, res).catch((e) => {
		console.error('[restic] request failed', e);
		if (!res.headersSent) send(res, 500);
		else res.destroy();
	});
}

/**
 * Makes `handleRequest` available to the HTTP server in front of SvelteKit. It runs outside
 * of the SvelteKit bundle, so the handler is passed through a global.
 */
export function registerHandler() {
	(globalThis as Record<symbol, unknown>)[Symbol.for('brgkpr.restic')] = handleRequest;
}

function send(res: ServerResponse, status: number, body?: string) {
	res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' });
	res.end(body ?? `${status}\n`);
}

async function handle(req: IncomingMessage, res: ServerResponse) {
	const url = new URL(req.url ?? '/', 'http://localhost');
	if (!url.pathname.startsWith(RESTIC_PREFIX)) return send(res, 404);
	const [repoId, type, name, ...rest] = url.pathname.slice(RESTIC_PREFIX.length).split('/');
	if (!repoId || rest.some(Boolean)) return send(res, 404);

	const ctx = await authenticate(req, repoId);
	if (!ctx) {
		res.setHeader('WWW-Authenticate', 'Basic realm="brgkpr"');
		return send(res, 401);
	}
	const method = req.method ?? 'GET';
	const path = ctx.repo.path;

	// /<repo>/
	if (!type) {
		if (method === 'POST' && url.searchParams.get('create') === 'true') {
			for (const t of TYPES) await mkdir(join(path, t), { recursive: true, mode: 0o700 });
			for (let i = 0; i < 256; i++) {
				await mkdir(join(path, 'data', i.toString(16).padStart(2, '0')), { mode: 0o700 }).catch(
					() => {}
				);
			}
			return send(res, 200);
		}
		// repositories are deleted in the web UI
		return send(res, method === 'DELETE' ? 403 : 405);
	}

	// /<repo>/config
	if (type === 'config' && !name) {
		const file = join(path, 'config');
		if (method === 'HEAD' || method === 'GET') return serveFile(req, res, file);
		if (method === 'POST') return receiveFile(req, res, ctx, file, null, false);
		if (method === 'DELETE') return deleteFile(res, ctx, file, false);
		return send(res, 405);
	}

	if (!TYPES.has(type)) return send(res, 404);

	// /<repo>/<type>/
	if (!name) {
		if (method !== 'GET') return send(res, 405);
		return list(req, res, path, type);
	}

	// /<repo>/<type>/<name>
	if (!NAME.test(name)) return send(res, 404);
	const file =
		type === 'data' ? join(path, 'data', name.slice(0, 2), name) : join(path, type, name);
	switch (method) {
		case 'HEAD':
		case 'GET':
			return serveFile(req, res, file);
		case 'POST':
			if (type === 'locks') ctx.session.locks.add(name);
			return receiveFile(req, res, ctx, file, name, type === 'locks');
		case 'DELETE':
			if (type === 'locks') {
				await deleteFile(res, ctx, file, true);
				ctx.session.locks.delete(name);
				// the client is done with this command
				if (ctx.session.locks.size === 0) finish(ctx.session);
				return;
			}
			return deleteFile(res, ctx, file, false);
		default:
			return send(res, 405);
	}
}

async function authenticate(req: IncomingMessage, repoId: string): Promise<Context | null> {
	const header = req.headers.authorization;
	if (!header?.startsWith('Basic ')) return null;
	const decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
	const sep = decoded.indexOf(':');
	if (sep === -1) return null;
	const keyId = decoded.slice(0, sep);
	const secret = decoded.slice(sep + 1);

	const [row] = await db
		.select({ key: accessKey, repo, owner: user })
		.from(accessKey)
		.innerJoin(repo, eq(accessKey.repoId, repo.id))
		.innerJoin(user, eq(repo.userId, user.id))
		.where(eq(accessKey.id, keyId));
	if (!row?.key.secretHash || row.repo.type !== 'restic' || row.owner.disabled) return null;
	const expected = Buffer.from(row.key.secretHash, 'hex');
	const actual = hashSecret(secret);
	if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
	if (row.repo.id !== repoId) return null;

	return { ...row, session: touch(row.key, row.repo, clientAddress(req)) };
}

/** like adapter-node's getClientAddress: ADDRESS_HEADER if configured, else the peer address */
function clientAddress(req: IncomingMessage) {
	const header = process.env.ADDRESS_HEADER?.toLowerCase();
	if (header) {
		const value = req.headers[header];
		const v = Array.isArray(value) ? value.join(',') : value;
		// x-forwarded-for lists every hop; the last entry was added by the nearest proxy
		const address = header === 'x-forwarded-for' ? v?.split(',').at(-1)?.trim() : v?.trim();
		return address || null;
	}
	return req.socket.remoteAddress?.replace(/^::ffff:/, '') || null;
}

// --- sessions ------------------------------------------------------------------------------

interface Session {
	key: string;
	id: string;
	repoId: string;
	locks: Set<string>;
	started: Promise<unknown>;
	timer?: ReturnType<typeof setTimeout>;
}

const sessions = new Map<string, Session>();

function touch(k: AccessKey, r: Repo, client: string | null) {
	const key = `${k.id}|${client}`;
	let s = sessions.get(key);
	if (!s) {
		const id = randomBytes(16).toString('hex');
		s = {
			key,
			id,
			repoId: r.id,
			locks: new Set(),
			started: startSession({ id, repoId: r.id, keyId: k.id, client }).catch((e) =>
				console.error('[restic] could not log session', e)
			)
		};
		sessions.set(key, s);
	}
	clearTimeout(s.timer);
	const session = s;
	s.timer = setTimeout(() => finish(session), IDLE_TIMEOUT);
	s.timer.unref?.();
	return s;
}

function finish(s: Session) {
	if (sessions.get(s.key) !== s) return;
	sessions.delete(s.key);
	clearTimeout(s.timer);
	if (![...sessions.values()].some((other) => other.repoId === s.repoId)) usage.delete(s.repoId);
	void s.started.then(() => endSession(s.id, s.repoId));
}

/**
 * Current size of repositories with open sessions, measured once and then kept up to date
 * with every upload and deletion.
 */
const usage = new Map<string, Promise<number>>();

function repoSize(r: Repo) {
	let size = usage.get(r.id);
	if (!size) {
		size = dirSize(r.path);
		usage.set(r.id, size);
	}
	return size;
}

function addUsage(r: Repo, bytes: number) {
	const size = usage.get(r.id);
	if (size)
		usage.set(
			r.id,
			size.then((n) => Math.max(0, n + bytes))
		);
}

// --- files ---------------------------------------------------------------------------------

async function list(req: IncomingMessage, res: ServerResponse, path: string, type: string) {
	const dir = join(path, type);
	const dirs = [dir];
	try {
		if (type === 'data') {
			const subdirs = await readdir(dir, { withFileTypes: true });
			dirs.splice(0, 1, ...subdirs.filter((d) => d.isDirectory()).map((d) => join(dir, d.name)));
		}
	} catch {
		return send(res, 404);
	}

	const v2 = (req.headers.accept ?? '').includes(V2);
	const entries: { name: string; size: number }[] = [];
	for (const d of dirs) {
		let names: string[];
		try {
			names = await readdir(d);
		} catch {
			if (d === dir) return send(res, 404);
			continue;
		}
		for (const name of names.filter((n) => NAME.test(n))) {
			entries.push({ name, size: v2 ? (await stat(join(d, name))).size : 0 });
		}
	}

	res.writeHead(200, { 'Content-Type': v2 ? V2 : V1 });
	res.end(JSON.stringify(v2 ? entries : entries.map((e) => e.name)));
}

/** GET (with a single byte range, which restic uses to read parts of packs) and HEAD. */
async function serveFile(req: IncomingMessage, res: ServerResponse, file: string) {
	let size: number;
	try {
		const s = await stat(file);
		if (!s.isFile()) return send(res, 404);
		size = s.size;
	} catch {
		return send(res, 404);
	}

	let start = 0;
	let end = size - 1;
	let status = 200;
	const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '');
	if (range && (range[1] || range[2])) {
		if (range[1]) {
			start = Number(range[1]);
			if (range[2]) end = Math.min(Number(range[2]), size - 1);
		} else {
			start = Math.max(0, size - Number(range[2]));
		}
		if (start >= size || start > end) {
			res.writeHead(416, { 'Content-Range': `bytes */${size}` });
			return res.end();
		}
		status = 206;
	}

	const headers: Record<string, string | number> = {
		'Content-Type': 'application/octet-stream',
		'Content-Length': size === 0 ? 0 : end - start + 1,
		'Accept-Ranges': 'bytes'
	};
	if (status === 206) headers['Content-Range'] = `bytes ${start}-${end}/${size}`;
	res.writeHead(status, headers);
	if (req.method === 'HEAD' || size === 0) return res.end();

	const stream = createReadStream(file, { start, end });
	stream.on('error', () => res.destroy());
	stream.pipe(res);
}

class TooLarge extends Error {}

/**
 * Stores an upload. It is written to a temporary file first and then linked into place,
 * which fails if the file exists, so nothing can be overwritten. Except for the config,
 * restic names files after the sha256 of their content, which is verified.
 */
async function receiveFile(
	req: IncomingMessage,
	res: ServerResponse,
	ctx: Context,
	file: string,
	name: string | null,
	isLock: boolean
) {
	let max: number | null = null;
	if (!isLock) {
		const size = await repoSize(ctx.repo);
		const quota = await quotaFor(ctx.repo, ctx.owner);
		if (quota != null) max = quota - size;
	}
	const length = Number(req.headers['content-length']);
	if (max != null && Number.isFinite(length) && length > max) {
		return send(res, 413, 'Storage quota exceeded\n');
	}

	const dir = dirname(file);
	await mkdir(dir, { recursive: true, mode: 0o700 });
	const tmp = join(dir, `.tmp-${randomBytes(8).toString('hex')}`);
	const handle = await open(tmp, 'wx', 0o600);
	const hash = createHash('sha256');
	let written = 0;
	let closed = false;
	try {
		for await (const chunk of req as AsyncIterable<Buffer>) {
			written += chunk.length;
			if (max != null && written > max) throw new TooLarge();
			hash.update(chunk);
			await handle.write(chunk);
		}
		await handle.sync();
		await handle.close();
		closed = true;

		if (name && hash.digest('hex') !== name) return send(res, 400, 'Hash mismatch\n');
		try {
			await link(tmp, file);
		} catch (e) {
			if ((e as NodeJS.ErrnoException).code === 'EEXIST') return send(res, 403, 'File exists\n');
			throw e;
		}
		addUsage(ctx.repo, written);
		send(res, 200);
	} catch (e) {
		if (e instanceof TooLarge) {
			send(res, 413, 'Storage quota exceeded\n');
			req.resume();
			return;
		}
		throw e;
	} finally {
		if (!closed) await handle.close().catch(() => {});
		await unlink(tmp).catch(() => {});
	}
}

async function deleteFile(res: ServerResponse, ctx: Context, file: string, isLock: boolean) {
	if (!isLock && (ctx.repo.appendOnly || ctx.key.appendOnly)) {
		return send(res, 403, 'Append-only mode\n');
	}
	let size: number;
	try {
		size = (await stat(file)).size;
		await unlink(file);
	} catch {
		return send(res, 404);
	}
	addUsage(ctx.repo, -size);
	send(res, 200);
}
