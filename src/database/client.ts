import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync, type SQLInputValue, type StatementSync } from 'node:sqlite';
import { drizzle, type SqliteRemoteDatabase } from 'drizzle-orm/sqlite-proxy';
import { StorageError } from '../domain/errors.js';
import * as schema from './schema.js';

export type Database = SqliteRemoteDatabase<typeof schema>;

export interface DatabaseHandle {
  db: Database;
  /** Runs raw SQL (migrations, pragmas). */
  exec(sql: string): void;
  close(): void;
}

/**
 * Opens SQLite through Node's built-in `node:sqlite` and exposes it to
 * Drizzle via the async proxy driver. Being async on the Drizzle side keeps
 * repository signatures identical to a future HTTP-backed implementation.
 */
export function openDatabase(file: string, options: { foreignKeys?: boolean } = {}): DatabaseHandle {
  let sqlite: DatabaseSync;
  try {
    if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
    sqlite = new DatabaseSync(file);
    // The remote-mode replica mirrors the server, which enforces integrity; rows may arrive in any order.
    sqlite.exec(`PRAGMA foreign_keys = ${options.foreignKeys === false ? 'OFF' : 'ON'}; PRAGMA busy_timeout = 5000;`);
    if (file !== ':memory:') sqlite.exec('PRAGMA journal_mode = WAL;');
  } catch (error) {
    throw new StorageError(`Could not open the database at ${file}.`, {
      hint: 'Check that the directory exists and is writable.',
      cause: error,
    });
  }

  const statements = new Map<string, StatementSync>();
  const prepare = (sql: string): StatementSync => {
    let statement = statements.get(sql);
    if (!statement) {
      statement = sqlite.prepare(sql);
      statements.set(sql, statement);
    }
    return statement;
  };

  const db = drizzle(
    async (sql, params: SQLInputValue[], method) => {
      try {
        const statement = prepare(sql);
        if (method === 'run') {
          statement.run(...params);
          return { rows: [] };
        }
        // Drizzle's proxy protocol expects positional rows (arrays), not objects.
        statement.setReturnArrays(true);
        if (method === 'get') {
          // For `get`, `rows` is the single row itself, and "no row" must be
          // `undefined` (an empty array would map to an all-undefined object).
          // Drizzle's callback type does not model that, hence the casts.
          const row = statement.get(...params);
          return { rows: row as unknown as unknown[] };
        }
        return { rows: statement.all(...params) };
      } catch (error) {
        throw new StorageError('The database rejected the operation.', { cause: error });
      }
    },
    { schema },
  );

  return {
    db,
    exec: (sql) => sqlite.exec(sql),
    close: () => {
      if (sqlite.isOpen) sqlite.close();
    },
  };
}
