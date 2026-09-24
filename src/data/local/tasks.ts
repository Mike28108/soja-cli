import { randomUUID } from 'node:crypto';
import { and, count, desc, eq, inArray, or, sql, type SQL } from 'drizzle-orm';
import type { Database } from '../../database/client.js';
import { tasks } from '../../database/schema.js';
import { NotFoundError } from '../../domain/errors.js';
import type { Task } from '../../domain/task.js';
import type { NewTask, StatusCountRow, TaskPatch, TaskQuery, TaskRepository } from '../repositories.js';
import type { Clock } from './clock.js';
import { must } from './users.js';

export class LocalTaskRepository implements TaskRepository {
  constructor(
    private readonly db: Database,
    private readonly clock: Clock,
  ) {}

  async create(input: NewTask): Promise<Task> {
    const now = this.clock();
    // Computing the number inside the INSERT keeps it atomic in SQLite.
    const nextNumber = sql<number>`(SELECT COALESCE(MAX(${tasks.number}), 0) + 1 FROM ${tasks} WHERE ${tasks.workspaceId} = ${input.workspaceId})`;
    const [task] = await this.db
      .insert(tasks)
      .values({
        startedAt: null,
        completedAt: null,
        ...input,
        id: randomUUID(),
        number: nextNumber,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    return must(task);
  }

  async findById(id: string): Promise<Task | null> {
    return (await this.db.select().from(tasks).where(eq(tasks.id, id)).get()) ?? null;
  }

  async findByNumber(workspaceId: string, number: number): Promise<Task | null> {
    const row = await this.db
      .select()
      .from(tasks)
      .where(and(eq(tasks.workspaceId, workspaceId), eq(tasks.number, number)))
      .get();
    return row ?? null;
  }

  async list(query: TaskQuery): Promise<Task[]> {
    const conditions: SQL[] = [eq(tasks.workspaceId, query.workspaceId)];
    if (query.assigneeId) conditions.push(eq(tasks.assigneeId, query.assigneeId));
    if (query.projectId) conditions.push(eq(tasks.projectId, query.projectId));
    if (query.statuses) conditions.push(inArray(tasks.status, [...query.statuses]));
    if (query.search) {
      const pattern = `%${escapeLike(query.search.text)}%`;
      const byTitle = sql`${tasks.title} LIKE ${pattern} ESCAPE '\\'`;
      const byNumber = query.search.number === null ? undefined : eq(tasks.number, query.search.number);
      conditions.push(or(byTitle, byNumber) ?? byTitle);
    }
    const statement = this.db
      .select()
      .from(tasks)
      .where(and(...conditions))
      .orderBy(desc(tasks.number));
    return query.limit ? statement.limit(query.limit) : statement;
  }

  async update(id: string, patch: TaskPatch): Promise<Task> {
    const [task] = await this.db
      .update(tasks)
      .set({ ...patch, updatedAt: this.clock() })
      .where(eq(tasks.id, id))
      .returning();
    if (!task) throw new NotFoundError('That task no longer exists.');
    return task;
  }

  async countByProjectAndStatus(workspaceId: string): Promise<StatusCountRow[]> {
    return this.db
      .select({ projectId: tasks.projectId, status: tasks.status, count: count() })
      .from(tasks)
      .where(eq(tasks.workspaceId, workspaceId))
      .groupBy(tasks.projectId, tasks.status);
  }
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}
