import { and, asc, eq, inArray, like } from 'drizzle-orm';
import type { Database } from '../../database/client.js';
import {
  chatChannels,
  chatMessages,
  chatReads,
  projects,
  projectRepositories,
  syncNotices,
  syncOutbox,
  syncPendingActivity,
  syncState,
  taskActivity,
  taskComments,
  tasks,
  users,
  workspaceMembers,
  workspaces,
} from '../../database/schema.js';
import type { TaskActivity } from '../../domain/activity.js';
import type { Channel, ChatMessage } from '../../domain/chat.js';
import type { Project, ProjectRepository, TaskComment, UserRef, Workspace, WorkspaceRole } from '../../domain/entities.js';
import type { Task } from '../../domain/task.js';

export type TaskOpType = 'task.create' | 'task.change' | 'task.comment' | 'task.git_event' | 'task.delete';
export type ChatOpType = 'message.send' | 'message.edit' | 'message.delete' | 'channel.read';
export type OpType = TaskOpType | ChatOpType;

export const isChatOp = (type: OpType): type is ChatOpType => !type.startsWith('task.');

export interface QueuedOp {
  seq: number;
  opId: string;
  workspaceId: string;
  type: OpType;
  /** Null for chat operations. */
  taskId: string | null;
  payload: Record<string, unknown>;
  base: Record<string, unknown> | null;
  occurredAt: Date;
  attempts: number;
  lastError: string | null;
}

export interface Notice {
  id: string;
  taskId: string | null;
  taskRef: string;
  kind: 'conflict' | 'rejected';
  message: string;
  field: string | null;
  overwritten: unknown;
  createdAt: Date;
}

/** Task fields as stored; server views carry extra presentation fields we drop. */
const TASK_COLUMNS = [
  'id', 'number', 'workspaceId', 'projectId', 'title', 'description', 'type', 'priority', 'status', 'assigneeId',
  'creatorId', 'requester', 'remunerated', 'priceMinor', 'currencyCode', 'externalApprovalStatus', 'branch', 'baseBranch', 'branchStart', 'createdAt', 'updatedAt', 'startedAt', 'completedAt', 'archivedAt',
] as const satisfies readonly (keyof Task)[];

const pickTask = (task: Task): Task =>
  Object.fromEntries(TASK_COLUMNS.map((column) => [column, task[column]])) as unknown as Task;

/**
 * The remote-mode replica: server state mirrored into the same SQLite schema
 * local mode uses, plus the outbox of operations not yet acknowledged.
 */
export class ReplicaStore {
  constructor(private readonly db: Database) {}

  // ── Server state ─────────────────────────────────────────────────────────

  async upsertUser(user: UserRef & { email?: string | null; createdAt?: Date; updatedAt?: Date }): Promise<void> {
    const now = new Date();
    const row = { id: user.id, username: user.username, displayName: user.displayName, email: user.email ?? null, createdAt: user.createdAt ?? now, updatedAt: user.updatedAt ?? now };
    await this.db.insert(users).values(row).onConflictDoUpdate({ target: users.id, set: { username: row.username, displayName: row.displayName } });
  }

  async upsertWorkspace(workspace: Workspace): Promise<void> {
    const row = { id: workspace.id, name: workspace.name, slug: workspace.slug, description: workspace.description, createdAt: workspace.createdAt, updatedAt: workspace.updatedAt };
    await this.db.insert(workspaces).values(row).onConflictDoUpdate({ target: workspaces.id, set: { name: row.name, slug: row.slug, description: row.description, updatedAt: row.updatedAt } });
  }

  async upsertMember(workspaceId: string, member: UserRef & { role: WorkspaceRole; designated?: boolean }): Promise<void> {
    await this.upsertUser(member);
    await this.db
      .insert(workspaceMembers)
      .values({ workspaceId, userId: member.id, role: member.role, designated: member.designated ?? member.role === 'owner' })
      .onConflictDoUpdate({ target: [workspaceMembers.workspaceId, workspaceMembers.userId], set: { role: member.role, designated: member.designated ?? member.role === 'owner' } });
  }

  /** Server projects have no local path; the one this machine linked is kept. */
  async upsertProject(project: Omit<Project, 'repositoryPath'> & { repositories?: ProjectRepository[] }): Promise<void> {
    const shared = {
      workspaceId: project.workspaceId, name: project.name, key: project.key, description: project.description,
      repositoryUrl: project.repositoryUrl, createdAt: project.createdAt, updatedAt: project.updatedAt,
    };
    await this.db.insert(projects).values({ id: project.id, ...shared, repositoryPath: null }).onConflictDoUpdate({ target: projects.id, set: shared });
    if (project.repositories) {
      const ids: string[] = [];
      for (const repository of project.repositories) {
        ids.push(repository.id);
        const existingName = await this.db.select().from(projectRepositories).where(and(eq(projectRepositories.projectId, project.id), eq(projectRepositories.name, repository.name))).get();
        const path = existingName?.localPath ?? null;
        if (existingName && existingName.id !== repository.id) {
          await this.db.update(projectRepositories).set({ name: `legacy-${existingName.id}` }).where(eq(projectRepositories.id, existingName.id));
          await this.db.insert(projectRepositories).values({ ...repository, localPath: path }).onConflictDoNothing();
          await this.db.update(tasks).set({ repositoryId: repository.id }).where(eq(tasks.repositoryId, existingName.id));
          for (const operation of await this.pending(project.workspaceId)) {
            if (!['task.create', 'task.change'].includes(operation.type) || operation.payload.repositoryId !== existingName.id) continue;
            await this.updateQueuedPayload(operation.opId, { ...operation.payload, repositoryId: repository.id });
          }
          await this.db.delete(projectRepositories).where(eq(projectRepositories.id, existingName.id));
        }
        await this.db.insert(projectRepositories).values({ ...repository, localPath: path }).onConflictDoUpdate({ target: projectRepositories.id, set: { name: repository.name, repositoryUrl: repository.repositoryUrl, updatedAt: repository.updatedAt } });
      }
      for (const stale of await this.db.select({ id: projectRepositories.id }).from(projectRepositories).where(eq(projectRepositories.projectId, project.id))) {
        if (!ids.includes(stale.id)) await this.db.delete(projectRepositories).where(eq(projectRepositories.id, stale.id));
      }
    }
  }

  /** This machine's folder for a project (never sent to the server). */
  async setRepositoryPath(projectId: string, path: string): Promise<void> {
    await this.db.update(projects).set({ repositoryPath: path }).where(eq(projects.id, projectId));
  }

  async setProjectRepositoryPath(repositoryId: string, path: string): Promise<void> {
    await this.db.update(projectRepositories).set({ localPath: path }).where(eq(projectRepositories.id, repositoryId));
  }

  async upsertTask(task: Task): Promise<void> {
    const row = pickTask(task);
    // The server's number may belong to a provisional row we replaced; numbers are unique per workspace.
    const clash = await this.db.select({ id: tasks.id }).from(tasks).where(and(eq(tasks.workspaceId, row.workspaceId), eq(tasks.number, row.number))).get();
    if (clash && clash.id !== row.id) await this.db.delete(tasks).where(eq(tasks.id, clash.id));
    const { id: _id, ...rest } = row;
    await this.db.insert(tasks).values(row).onConflictDoUpdate({ target: tasks.id, set: rest });
  }

  async upsertComment(comment: TaskComment): Promise<void> {
    const { id: _id, ...rest } = comment;
    await this.db.insert(taskComments).values(comment).onConflictDoUpdate({ target: taskComments.id, set: rest });
  }

  async upsertActivity(activity: TaskActivity): Promise<void> {
    await this.db
      .insert(taskActivity)
      .values({ id: activity.id, taskId: activity.taskId, userId: activity.userId, type: activity.type, metadata: activity.metadata, createdAt: activity.createdAt })
      .onConflictDoNothing();
  }

  async patchTask(id: string, fields: Partial<Task>): Promise<void> {
    if (Object.keys(fields).length === 0) return;
    await this.db.update(tasks).set(fields).where(eq(tasks.id, id));
  }

  async deleteTask(id: string): Promise<void> {
    await this.db.delete(taskActivity).where(eq(taskActivity.taskId, id));
    await this.db.delete(taskComments).where(eq(taskComments.taskId, id));
    await this.db.delete(tasks).where(eq(tasks.id, id));
  }

  async findTask(id: string): Promise<Task | null> {
    return (await this.db.select().from(tasks).where(eq(tasks.id, id)).get()) ?? null;
  }

  async activityIds(taskId: string): Promise<Set<string>> {
    const rows = await this.db.select({ id: taskActivity.id }).from(taskActivity).where(eq(taskActivity.taskId, taskId));
    return new Set(rows.map((row) => row.id));
  }

  /** Next provisional number: -1, -2, … (shown as SOJA-?1, SOJA-?2). */
  async nextProvisionalNumber(workspaceId: string): Promise<number> {
    const rows = await this.db.select({ number: tasks.number }).from(tasks).where(eq(tasks.workspaceId, workspaceId));
    return Math.min(0, ...rows.map((row) => row.number)) - 1;
  }

  // ── Outbox ───────────────────────────────────────────────────────────────

  async enqueue(op: Omit<QueuedOp, 'seq' | 'attempts' | 'lastError'>, optimisticActivity: Iterable<string>): Promise<void> {
    await this.db.insert(syncOutbox).values({ ...op, attempts: 0, lastError: null });
    for (const activityId of optimisticActivity) {
      await this.db.insert(syncPendingActivity).values({ activityId, opId: op.opId }).onConflictDoNothing();
    }
  }

  async pending(workspaceId: string): Promise<QueuedOp[]> {
    const rows = await this.db.select().from(syncOutbox).where(eq(syncOutbox.workspaceId, workspaceId)).orderBy(asc(syncOutbox.seq));
    return rows.map((row) => ({ ...row, type: row.type as OpType }));
  }

  /** Drops acknowledged operations and the optimistic activity they wrote (the server's arrives by pull). */
  async acknowledge(opIds: readonly string[]): Promise<void> {
    if (opIds.length === 0) return;
    const optimistic = await this.db.select().from(syncPendingActivity).where(inArray(syncPendingActivity.opId, [...opIds]));
    if (optimistic.length) {
      await this.db.delete(taskActivity).where(inArray(taskActivity.id, optimistic.map((row) => row.activityId)));
      await this.db.delete(syncPendingActivity).where(inArray(syncPendingActivity.opId, [...opIds]));
    }
    await this.db.delete(syncOutbox).where(inArray(syncOutbox.opId, [...opIds]));
  }

  async markAttempt(workspaceId: string, error: string): Promise<void> {
    const rows = await this.pending(workspaceId);
    for (const row of rows) {
      await this.db.update(syncOutbox).set({ attempts: row.attempts + 1, lastError: error }).where(eq(syncOutbox.opId, row.opId));
    }
  }

  // ── Cursor and notices ───────────────────────────────────────────────────

  async state(workspaceId: string): Promise<{ cursor: number; lastSyncAt: Date | null; lastError: string | null }> {
    const row = await this.db.select().from(syncState).where(eq(syncState.workspaceId, workspaceId)).get();
    return { cursor: row?.cursor ?? 0, lastSyncAt: row?.lastSyncAt ?? null, lastError: row?.lastError ?? null };
  }

  async saveState(workspaceId: string, patch: { cursor?: number; lastSyncAt?: Date; lastError?: string | null }): Promise<void> {
    const current = await this.state(workspaceId);
    const row = { workspaceId, cursor: patch.cursor ?? current.cursor, lastSyncAt: patch.lastSyncAt ?? current.lastSyncAt, lastError: patch.lastError === undefined ? current.lastError : patch.lastError };
    await this.db.insert(syncState).values(row).onConflictDoUpdate({ target: syncState.workspaceId, set: row });
  }

  async addNotice(workspaceId: string, notice: Omit<Notice, 'createdAt'>): Promise<void> {
    await this.db.insert(syncNotices).values({ ...notice, workspaceId, createdAt: new Date() }).onConflictDoNothing();
  }

  async notices(workspaceId: string, taskId?: string): Promise<Notice[]> {
    const rows = await this.db.select().from(syncNotices).where(eq(syncNotices.workspaceId, workspaceId)).orderBy(asc(syncNotices.createdAt));
    return rows
      .filter((row) => row.dismissedAt === null && (!taskId || row.taskId === taskId))
      .map(({ workspaceId: _ws, dismissedAt: _dismissed, ...notice }) => notice);
  }

  async dismissNotice(id: string): Promise<void> {
    await this.db.update(syncNotices).set({ dismissedAt: new Date() }).where(eq(syncNotices.id, id));
  }

  // ── Chat ─────────────────────────────────────────────────────────────────

  async upsertChannel(channel: Channel): Promise<void> {
    const row = pickChannel(channel);
    const { id: _id, ...rest } = row;
    await this.db.insert(chatChannels).values(row).onConflictDoUpdate({ target: chatChannels.id, set: rest });
  }

  async channels(workspaceId: string): Promise<Channel[]> {
    return this.db.select().from(chatChannels).where(eq(chatChannels.workspaceId, workspaceId)).orderBy(asc(chatChannels.name));
  }

  async findChannel(id: string): Promise<Channel | null> {
    return (await this.db.select().from(chatChannels).where(eq(chatChannels.id, id)).get()) ?? null;
  }

  async upsertMessage(message: ChatMessage): Promise<void> {
    const row = pickMessage(message);
    const { id: _id, ...rest } = row;
    await this.db.insert(chatMessages).values(row).onConflictDoUpdate({ target: chatMessages.id, set: rest });
  }

  async patchMessage(id: string, fields: Partial<Pick<ChatMessage, 'body' | 'editedAt' | 'deletedAt'>>): Promise<void> {
    await this.db.update(chatMessages).set(fields).where(eq(chatMessages.id, id));
  }

  async deleteMessage(id: string): Promise<void> {
    await this.db.delete(chatMessages).where(eq(chatMessages.id, id));
  }

  async findMessage(id: string): Promise<ChatMessage | null> {
    return (await this.db.select().from(chatMessages).where(eq(chatMessages.id, id)).get()) ?? null;
  }

  async messagesIn(channelId: string): Promise<ChatMessage[]> {
    return this.db.select().from(chatMessages).where(eq(chatMessages.channelId, channelId));
  }

  /** Messages whose text contains `fragment` (a cheap prefilter; callers check the exact match). */
  async messagesContaining(workspaceId: string, fragment: string): Promise<ChatMessage[]> {
    return this.db
      .select()
      .from(chatMessages)
      .where(and(eq(chatMessages.workspaceId, workspaceId), like(chatMessages.body, `%${fragment.replace(/[%_]/g, '')}%`)));
  }

  async reads(): Promise<Map<string, number>> {
    const rows = await this.db.select().from(chatReads);
    return new Map(rows.map((row) => [row.channelId, row.lastReadSeq]));
  }

  /** Read marks only move forward, as on the server. */
  async markRead(channelId: string, lastReadSeq: number): Promise<void> {
    const current = (await this.reads()).get(channelId) ?? 0;
    if (lastReadSeq <= current) return;
    await this.db.insert(chatReads).values({ channelId, lastReadSeq }).onConflictDoUpdate({ target: chatReads.channelId, set: { lastReadSeq } });
  }

  /** Drops a queued operation that was never sent (e.g. an older read mark superseded by a newer one). */
  async dropQueued(opId: string): Promise<void> {
    await this.db.delete(syncOutbox).where(eq(syncOutbox.opId, opId));
  }

  async updateQueuedPayload(opId: string, payload: Record<string, unknown>): Promise<void> {
    await this.db.update(syncOutbox).set({ payload }).where(eq(syncOutbox.opId, opId));
  }
}

const CHANNEL_COLUMNS = ['id', 'workspaceId', 'name', 'topic', 'createdBy', 'createdAt', 'updatedAt', 'archivedAt'] as const satisfies readonly (keyof Channel)[];
const MESSAGE_COLUMNS = [
  'id', 'seq', 'workspaceId', 'channelId', 'authorId', 'body', 'replyToId', 'createdAt', 'editedAt', 'deletedAt',
] as const satisfies readonly (keyof ChatMessage)[];

/** Server views may carry extra fields (e.g. `lastReadSeq` on channels). */
const pickChannel = (channel: Channel): Channel =>
  Object.fromEntries(CHANNEL_COLUMNS.map((column) => [column, channel[column] ?? null])) as unknown as Channel;
const pickMessage = (message: ChatMessage): ChatMessage =>
  Object.fromEntries(MESSAGE_COLUMNS.map((column) => [column, message[column] ?? null])) as unknown as ChatMessage;
