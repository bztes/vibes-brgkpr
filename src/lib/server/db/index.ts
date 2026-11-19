import { mkdirSync } from 'node:fs';
import { drizzle } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';
import { createClient } from '@libsql/client';
import * as schema from './schema.js';
import { databaseFile, dataDir, migrationsDir } from '../paths.js';

mkdirSync(dataDir, { recursive: true });

const client = createClient({ url: `file:${databaseFile}` });

export const db = drizzle(client, { schema });

let migrated: Promise<void> | undefined;

/** Applies pending migrations from drizzle/ (once per process). */
export function runMigrations() {
	migrated ??= (async () => {
		await client.execute('PRAGMA journal_mode = WAL');
		await client.execute('PRAGMA foreign_keys = ON');
		await migrate(db, { migrationsFolder: migrationsDir });
	})();
	return migrated;
}
