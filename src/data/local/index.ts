import { AsyncLocalStorage } from 'node:async_hooks';
import type { DatabaseHandle } from '../../database/client.js';
import type { Repositories } from '../repositories.js';
import { LocalActivityRepository } from './activity.js';
import { type Clock, systemClock } from './clock.js';
import { LocalCommentRepository } from './comments.js';
import { LocalProjectRepository } from './projects.js';
import { LocalTaskRepository } from './tasks.js';
import { LocalUserRepository } from './users.js';
import { LocalWorkspaceRepository } from './workspaces.js';

export function createLocalRepositories(handle: DatabaseHandle, clock: Clock = systemClock): Repositories {
  const { db } = handle;
  return {
    users: new LocalUserRepository(db, clock),
    workspaces: new LocalWorkspaceRepository(db, clock),
    projects: new LocalProjectRepository(db, clock),
    tasks: new LocalTaskRepository(db, clock),
    comments: new LocalCommentRepository(db, clock),
    activity: new LocalActivityRepository(db, clock),
    transaction: createTransactionRunner(handle),
  };
}

/**
 * One SQLite connection is shared by every repository, so transactions are
 * serialized. Nested calls (a service calling another inside a transaction)
 * join the outer transaction instead of deadlocking on the queue.
 */
function createTransactionRunner(handle: DatabaseHandle): Repositories['transaction'] {
  const context = new AsyncLocalStorage<true>();
  let queue: Promise<unknown> = Promise.resolve();

  return <T>(work: () => Promise<T>): Promise<T> => {
    if (context.getStore()) return work();

    const run = async (): Promise<T> => {
      handle.exec('BEGIN IMMEDIATE');
      try {
        const result = await context.run(true, work);
        handle.exec('COMMIT');
        return result;
      } catch (error) {
        handle.exec('ROLLBACK');
        throw error;
      }
    };
    const result = queue.then(run, run);
    queue = result.catch(() => undefined);
    return result;
  };
}
