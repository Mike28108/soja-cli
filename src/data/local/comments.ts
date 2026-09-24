import { randomUUID } from 'node:crypto';
import { asc, eq, sql } from 'drizzle-orm';
import type { Database } from '../../database/client.js';
import { taskComments } from '../../database/schema.js';
import type { TaskComment } from '../../domain/entities.js';
import type { CommentRepository } from '../repositories.js';
import type { Clock } from './clock.js';
import { must } from './users.js';

export class LocalCommentRepository implements CommentRepository {
  constructor(
    private readonly db: Database,
    private readonly clock: Clock,
  ) {}

  async create(input: { id?: string; taskId: string; userId: string; body: string }): Promise<TaskComment> {
    const now = this.clock();
    const [comment] = await this.db
      .insert(taskComments)
      .values({ ...input, id: input.id ?? randomUUID(), createdAt: now, updatedAt: now })
      .returning();
    return must(comment);
  }

  async listByTask(taskId: string): Promise<TaskComment[]> {
    return this.db
      .select()
      .from(taskComments)
      .where(eq(taskComments.taskId, taskId))
      .orderBy(asc(taskComments.createdAt), asc(sql`rowid`));
  }
}
