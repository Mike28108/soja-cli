import { randomUUID } from 'node:crypto';
import type { TaskView } from '../../application/types.js';
import type { TaskActivity } from '../../domain/activity.js';
import type { Project, TaskComment, User, UserRef, Workspace, WorkspaceRole } from '../../domain/entities.js';
import { formatTaskRef, isProvisional, type Task } from '../../domain/task.js';
import { OfflineError, type ApiClient } from '../remote/api-client.js';
import type { WorkspaceWithRole } from '../repositories.js';
import type { QueuedOp, ReplicaStore } from './store.js';

interface OpResult {
  opId: string;
  status: 'applied' | 'rejected';
  task?: TaskView;
  conflicts?: { field: string; overwritten: unknown; at: string }[];
  error?: { code: string; message: string };
}

interface ChangeBatch {
  cursor: number;
  hasMore: boolean;
  tasks: TaskView[];
  comments: TaskComment[];
  activity: TaskActivity[];
  projects: Omit<Project, 'repositoryPath'>[];
  members: (UserRef & { role: WorkspaceRole })[];
}

export interface SyncReport {
  online: boolean;
  pushed: number;
  conflicts: number;
  rejected: number;
  pulledTasks: number;
  error?: string;
}

export interface SyncStatus {
  /** null until the first attempt. */
  online: boolean | null;
  syncing: boolean;
  pending: number;
  lastSyncAt: Date | null;
  lastError: string | null;
}

const BATCH = 100;
const TASK_FIELDS = new Set(['title', 'description', 'projectId', 'type', 'priority', 'status', 'assigneeId', 'requester', 'branch', 'baseBranch', 'branchStart']);

/** Server task view → stored task row (presentation fields are dropped by the store). */
const toTask = (view: TaskView): Task => view;

/**
 * Keeps a workspace replica in step with the SOJA server (docs/SYNC.md in
 * soja-backend): push the outbox, apply results, pull changes, re-apply
 * what is still pending. One cycle at a time; failures leave the outbox
 * intact for the next attempt.
 */
export class SyncEngine {
  private running: Promise<SyncReport> | null = null;
  private online: boolean | null = null;
  private listeners = new Set<() => void>();

  constructor(
    private readonly api: ApiClient,
    private readonly store: ReplicaStore,
  ) {}

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  async status(workspaceId: string): Promise<SyncStatus> {
    const [pending, state] = await Promise.all([this.store.pending(workspaceId), this.store.state(workspaceId)]);
    return { online: this.online, syncing: this.running !== null, pending: pending.length, lastSyncAt: state.lastSyncAt, lastError: state.lastError };
  }

  /** Downloads who you are and your workspaces. Needed before the first sync of a workspace. */
  async refreshAccount(): Promise<{ user: User; workspaces: WorkspaceWithRole[] }> {
    const me = await this.api.get<{ user: User; workspaces: WorkspaceWithRole[] }>('/v1/me');
    await this.store.upsertUser(me.user);
    for (const workspace of me.workspaces) {
      await this.store.upsertWorkspace(workspace as Workspace);
      await this.store.upsertMember(workspace.id, { ...me.user, role: workspace.role });
    }
    this.online = true;
    return me;
  }

  /** Runs one sync cycle, or joins the one already running. Never throws. */
  sync(workspaceId: string): Promise<SyncReport> {
    if (this.running) return this.running;
    this.running = this.cycle(workspaceId).finally(() => {
      this.running = null;
      this.emit();
    });
    this.emit();
    return this.running;
  }

  private async cycle(workspaceId: string): Promise<SyncReport> {
    const report: SyncReport = { online: true, pushed: 0, conflicts: 0, rejected: 0, pulledTasks: 0 };
    let pushError: unknown = null;
    try {
      try {
        await this.push(workspaceId, report);
      } catch (error) {
        // Offline: nothing else will work either. A server error: still pull others' changes.
        if (error instanceof OfflineError) throw error;
        pushError = error;
        await this.store.markAttempt(workspaceId, error instanceof Error ? error.message : String(error));
      }
      await this.pull(workspaceId, report);
      await this.reapplyPending(workspaceId);
      if (pushError) throw pushError;
      await this.store.saveState(workspaceId, { lastSyncAt: new Date(), lastError: null });
      this.online = true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.online = !(error instanceof OfflineError);
      report.online = this.online;
      report.error = message;
      if (error !== pushError) await this.store.markAttempt(workspaceId, message);
      await this.store.saveState(workspaceId, { lastError: message });
      // Pending changes stay visible even when the pull could not run.
      await this.reapplyPending(workspaceId).catch(() => undefined);
    }
    return report;
  }

  private async push(workspaceId: string, report: SyncReport): Promise<void> {
    for (;;) {
      const batch = (await this.store.pending(workspaceId)).slice(0, BATCH);
      if (batch.length === 0) return;
      const { results } = await this.api.post<{ results: OpResult[] }>(`/v1/workspaces/${workspaceId}/ops`, {
        ops: batch.map((op) => ({
          opId: op.opId,
          type: op.type,
          taskId: op.taskId,
          occurredAt: op.occurredAt.toISOString(),
          payload: op.payload,
          ...(op.base ? { base: op.base } : {}),
        })),
      });

      const acknowledged: string[] = [];
      const refresh = new Set<string>();
      for (const op of batch) {
        const result = results.find((candidate) => candidate.opId === op.opId);
        if (!result) continue;
        acknowledged.push(op.opId);
        if (result.status === 'applied' && result.task) {
          report.pushed += 1;
          await this.store.upsertTask(toTask(result.task));
          for (const conflict of result.conflicts ?? []) {
            report.conflicts += 1;
            await this.store.addNotice(workspaceId, {
              id: randomUUID(),
              taskId: op.taskId,
              taskRef: result.task.ref,
              kind: 'conflict',
              field: conflict.field,
              overwritten: conflict.overwritten,
              message: `Your ${conflict.field} change on ${result.task.ref} replaced a newer value: ${describe(conflict.overwritten)}`,
            });
          }
        } else {
          report.rejected += 1;
          await this.rejected(workspaceId, op, result, refresh);
        }
      }
      await this.store.acknowledge(acknowledged);
      // Best effort: the rejection notice is already recorded; the next pull corrects the rest.
      for (const taskId of refresh) await this.refreshTask(workspaceId, taskId).catch(() => undefined);
    }
  }

  private async rejected(workspaceId: string, op: QueuedOp, result: OpResult, refresh: Set<string>): Promise<void> {
    const task = await this.store.findTask(op.taskId);
    const ref = task ? formatTaskRef(task.number) : 'a task';
    await this.store.addNotice(workspaceId, {
      id: randomUUID(),
      taskId: op.type === 'task.create' ? null : op.taskId,
      taskRef: ref,
      kind: 'rejected',
      field: null,
      overwritten: null,
      message: `${op.type === 'task.create' ? `Could not create ${ref}` : `A change to ${ref} was not applied`}: ${result.error?.message ?? 'rejected by the server'}`,
    });
    // A task the server never accepted must not linger; other rejections are undone by reloading the task.
    if (op.type === 'task.create') await this.store.deleteTask(op.taskId);
    else refresh.add(op.taskId);
  }

  private async refreshTask(workspaceId: string, taskId: string): Promise<void> {
    const task = await this.store.findTask(taskId);
    if (!task || isProvisional(task.number)) return;
    const details = await this.api.get<{ task: TaskView; comments: TaskComment[]; activity: TaskActivity[] }>(
      `/v1/workspaces/${workspaceId}/tasks/${formatTaskRef(task.number)}`,
    );
    await this.store.upsertTask(toTask(details.task));
    for (const comment of details.comments) await this.store.upsertComment(comment);
    for (const activity of details.activity) await this.store.upsertActivity(activity);
  }

  private async pull(workspaceId: string, report: SyncReport): Promise<void> {
    let { cursor } = await this.store.state(workspaceId);
    for (;;) {
      const batch = await this.api.get<ChangeBatch>(`/v1/workspaces/${workspaceId}/changes?after=${cursor}&limit=500`);
      for (const member of batch.members) await this.store.upsertMember(workspaceId, member);
      for (const project of batch.projects) await this.store.upsertProject(project);
      for (const task of batch.tasks) await this.store.upsertTask(toTask(task));
      for (const comment of batch.comments) await this.store.upsertComment(comment);
      for (const activity of batch.activity) await this.store.upsertActivity(activity);
      report.pulledTasks += batch.tasks.length;
      cursor = batch.cursor;
      await this.store.saveState(workspaceId, { cursor });
      if (!batch.hasMore) return;
    }
  }

  /** Server rows may predate queued edits; put the queued field values back on top. */
  private async reapplyPending(workspaceId: string): Promise<void> {
    for (const op of await this.store.pending(workspaceId)) {
      if (op.type !== 'task.change') continue;
      const fields = Object.fromEntries(Object.entries(op.payload).filter(([field]) => TASK_FIELDS.has(field)));
      await this.store.patchTask(op.taskId, fields as Partial<Task>);
    }
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}

function describe(value: unknown): string {
  if (value === null || value === undefined || value === '') return '(empty)';
  return typeof value === 'string' ? `“${value}”` : JSON.stringify(value);
}
