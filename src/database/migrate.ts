import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/sqlite-proxy/migrator';
import { StorageError } from '../domain/errors.js';
import type { DatabaseHandle } from './client.js';

// Shipped next to this module in both src/ (tsx) and dist/ (copied at build).
const MIGRATIONS_FOLDER = fileURLToPath(new URL('./migrations', import.meta.url));

/** Applies pending migrations in a single transaction. Cheap when there is nothing to do. */
export async function runMigrations(handle: DatabaseHandle): Promise<void> {
  try {
    await migrate(
      handle.db,
      async (queries) => {
        if (queries.length === 0) return;
        handle.exec('BEGIN');
        try {
          for (const query of queries) handle.exec(query);
          handle.exec('COMMIT');
        } catch (error) {
          handle.exec('ROLLBACK');
          throw error;
        }
      },
      { migrationsFolder: MIGRATIONS_FOLDER },
    );
  } catch (error) {
    throw new StorageError('Could not upgrade the database schema.', { cause: error });
  }
}
