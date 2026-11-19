import { eq } from 'drizzle-orm';
import { chmod, lstat, unlink } from 'node:fs/promises';
import { createServer, type Server, type Socket } from 'node:net';
import { sessionSocket } from '../../paths.js';
import { db } from '../../db/index.js';
import { repo } from '../../db/schema.js';
import { endSession, startSession } from '../../connections.js';

/**
 * brgkpr-serve (the forced SSH command, see docker/brgkpr-serve) connects to this socket when
 * an SSH session starts, sends one JSON line `{"session", "repo", "key", "client"}` and keeps
 * the socket open until `borg serve` has exited. Once the socket closes (also if the wrapper
 * gets killed) the session ends.
 *
 * If the app restarted during a session, the wrapper reconnects at the end and sends the line
 * again; the session id makes it update the existing log entry.
 *
 * Only the borg user can connect (mode 0600); SSH clients never get anything but the forced
 * command, so they can't reach it.
 */
export async function listenForSessions() {
	const g = globalThis as { __brgkprSocket?: Server };
	g.__brgkprSocket?.close(); // dev server reload

	// remove a socket left behind by a previous run (but never anything else)
	try {
		if ((await lstat(sessionSocket)).isSocket()) await unlink(sessionSocket);
	} catch {
		// does not exist
	}

	const server = createServer(handle);
	server.on('error', (e) => console.error('[borg] session socket failed', e));
	server.unref();
	server.listen(sessionSocket, () => void chmod(sessionSocket, 0o600).catch(() => {}));
	g.__brgkprSocket = server;
}

function handle(conn: Socket) {
	let buffer = '';
	let session: Promise<{ id: string; repoId: string } | null> | undefined;

	conn.setEncoding('utf8');
	// the line has to arrive quickly, afterwards the socket stays open for the session
	conn.setTimeout(5_000, () => conn.destroy());
	conn.on('data', (chunk: string) => {
		if (session) return;
		buffer += chunk;
		if (buffer.length > 4096) return void conn.destroy();
		const nl = buffer.indexOf('\n');
		if (nl === -1) return;
		conn.setTimeout(0);
		session = start(parse(buffer.slice(0, nl)));
	});
	conn.on('close', () => void session?.then((s) => s && endSession(s.id, s.repoId)));
	conn.on('error', () => {});
}

function parse(line: string): Record<string, unknown> | null {
	try {
		const msg: unknown = JSON.parse(line);
		return typeof msg === 'object' && msg !== null ? (msg as Record<string, unknown>) : null;
	} catch {
		return null;
	}
}

const str = (v: unknown) => (typeof v === 'string' && v.length <= 200 ? v : null);

async function start(msg: Record<string, unknown> | null) {
	const id = str(msg?.session);
	const path = str(msg?.repo);
	if (!id || !/^[0-9a-f]{32}$/.test(id) || !path) return null;
	try {
		const [r] = await db.select({ id: repo.id }).from(repo).where(eq(repo.path, path));
		if (!r) return null;
		const ok = await startSession({
			id,
			repoId: r.id,
			keyId: str(msg?.key),
			client: str(msg?.client)
		});
		return ok ? { id, repoId: r.id } : null;
	} catch (e) {
		console.error('[borg] could not log session', e);
		return null;
	}
}
