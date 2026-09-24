import { randomUUID } from 'node:crypto';
import { asc, eq, sql } from 'drizzle-orm';
import type { Database } from '../../database/client.js';
import { taskActivity } from '../../database/schema.js';
import type { ActivityEvent, TaskActivity } from '../../domain/activity.js';
import type { ActivityRepository } from '../repositories.js';
import type { Clock } from './clock.js';

type ActivityRow = typeof taskActivity.$inferSelect;

export class LocalActivityRepository implements ActivityRepository {
  constructor(
    private readonly db: Database,
    private readonly clock: Clock,
  ) {}

  async record(taskId: string, userId: string | null, event: ActivityEvent): Promise<TaskActivity> {
    const [row] = await this.db
      .insert(taskActivity)
      .values({ id: randomUUID(), taskId, userId, type: event.type, metadata: event.metadata, createdAt: this.clock() })
      .returning();
    if (!row) throw new Error('Expected the database to return a row');
    return toActivity(row);
  }

  async listByTask(taskId: string): Promise<TaskActivity[]> {
    const rows = await this.db
      .select()
      .from(taskActivity)
      .where(eq(taskActivity.taskId, taskId))
      .orderBy(asc(taskActivity.createdAt), asc(sql`rowid`));
    return rows.map(toActivity);
  }
}

// `type` and `metadata` are written together from an ActivityEvent, so the
// row pair is always one of the union members; TypeScript cannot see that.
function toActivity(row: ActivityRow): TaskActivity {
  return row as TaskActivity;
}
