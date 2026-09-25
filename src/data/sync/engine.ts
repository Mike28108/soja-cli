import { randomUUID } from 'node:crypto';
import type { TaskView } from '../../application/types.js';
import type { TaskActivity } from '../../domain/activity.js';
import type { Channel, ChatMessage } from '../../domain/chat.js';
import type { Project, TaskComment, User, UserRef, Workspace, WorkspaceRole } from '../../domain/entities.js';
import { formatTaskRef, isProvisional, TASK_REF_PREFIX, type Task } from '../../domain/task.js';
import { OfflineError, type ApiClient } from '../remote/api-client.js';
import type { WorkspaceWithRole } from '../repositories.js';
import { isChatOp, type QueuedOp, type ReplicaStore } from './store.js';

interface OpResult {
  opId: string;
  status: 'applied' | 'rejected';
  task?: TaskView;
  message?: ChatMessage;
  read?: { channelId: string; lastReadSeq: number };
  deleted?: { taskId: string };
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
  /** Chat (servers ≥ 0.3). */
  channels?: Channel[];
  messages?: ChatMessage[];
  reads?: { channelId: string; lastReadSeq: number }[];
  /** Tasks deleted by an owner (servers ≥ 1.0). */
  deletedTasks?: string[];
}

/** Pushed by the server over the live connection (docs/CHAT.md). */
export type LiveEvent =
  | { type: 'message.created' | 'message.updated'; message: ChatMessage }
  | { type: 'channel.created' | 'channel.updated'; channel: Channel }
  | { type: 'changes.available' };

export interface SyncReport {
  online: boolean;
  pushed: number;
  conflicts: number;
  rejected: number;
  /** Chat operations the server refused (e.g. a message to an archived channel). */
  chatRejected: number;
  /** Operations the server left for later (message rate limit); they stay queued. */
  deferred: number;
  pulledTasks: number;
  pulledMessages: number;
  /** True for updates that arrived over the live connection rather than a sync cycle. */
  live?: boolean;
  /** Replica entities changed by this cycle; empty means views need no data reload. */
  changes: {
    taskRefs: string[];
    projects: boolean;
    members: boolean;
    chatChannelIds: string[];
    chatMessageChannelIds: string[];
    chatReads: boolean;
  };
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

const emptyReport = (): SyncReport => ({
  online: true,
  pushed: 0,
  conflicts: 0,
  rejected: 0,
  chatRejected: 0,
  deferred: 0,
  pulledTasks: 0,
  pulledMessages: 0,
  changes: { taskRefs: [], projects: false, members: false, chatChannelIds: [], chatMessageChannelIds: [], chatReads: false },
});

function include(values: string[], value: string): void {
  if (!values.includes(value)) values.push(value);
}

function taskIdOf(op: QueuedOp): string {
  if (!op.taskId) throw new Error(`Operation ${op.type} has no task.`);
  return op.taskId;
}

/** `SOJA-?3` as written in text, not followed by more digits. */
const provisionalRefPattern = (number: number) => new RegExp(`\\b${TASK_REF_PREFIX}-\\?${-number}(?!\\d)`, 'gi');

/**
 * A message that names a task created offline (`SOJA-?1`) waits until that
 * task has its real number, so it reaches the server as `SOJA-7`. The batch
 * stops before such a message when the task is created earlier in the batch.
 */
function sendable(batch: readonly QueuedOp[]): QueuedOp[] {
  const provisional = new RegExp(`\\b${TASK_REF_PREFIX}-\\?\\d`, 'i');
  let creates = false;
  for (const [index, op] of batch.entries()) {
    if (op.type === 'task.create') creates = true;
    else if (creates && isChatOp(op.type) && provisional.test(String(op.payload['body'] ?? ''))) return batch.slice(0, index);
  }
  return [...batch];
}

/**
 * Keeps a workspace replica in step with the SOJA server (docs/SYNC.md in
 * soja-backend): push the outbox, apply results, pull changes, re-apply
 * what is still pending. One cycle at a time; failures leave the outbox
 * intact for the next attempt.
 */
export class SyncEngine {
  private running: Promise<SyncReport> | null = null;
  private queued: Promise<SyncReport> | null = null;
  private online: boolean | null = null;
  /** Called with null when a cycle starts and with its report when it ends. */
  private listeners = new Set<(report: SyncReport | null) => void>();

  constructor(
    private readonly api: ApiClient,
    private readonly store: ReplicaStore,
  ) {}

  subscribe(listener: (report: SyncReport | null) => void): () => void {
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

  /**
   * Runs one sync cycle. While one is running, a single follow-up cycle is
   * queued (whatever was written meanwhile may have missed its push); every
   * caller in between shares it. Never throws.
   */
  sync(workspaceId: string): Promise<SyncReport> {
    if (this.running) {
      this.queued ??= this.running.then(() => {
        this.queued = null;
        return this.sync(workspaceId);
      });
      return this.queued;
    }
    this.running = this.cycle(workspaceId).then((report) => {
      this.running = null;
      this.emit(report);
      return report;
    });
    this.emit(null);
    return this.running;
  }

  private async cycle(workspaceId: string): Promise<SyncReport> {
    const report = emptyReport();
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
      // Best effort: the replica may already be closed when a late cycle fails.
      if (error !== pushError) await this.store.markAttempt(workspaceId, message).catch(() => undefined);
      await this.store.saveState(workspaceId, { lastError: message }).catch(() => undefined);
      // Pending changes stay visible even when the pull could not run.
      await this.reapplyPending(workspaceId).catch(() => undefined);
    }
    return report;
  }

  private async push(workspaceId: string, report: SyncReport): Promise<void> {
    for (;;) {
      const batch = sendable((await this.store.pending(workspaceId)).slice(0, BATCH));
      if (batch.length === 0) return;
      const { results } = await this.api.post<{ results: OpResult[] }>(`/v1/workspaces/${workspaceId}/ops`, {
        ops: batch.map((op) => ({
          opId: op.opId,
          type: op.type,
          ...(op.taskId ? { taskId: op.taskId } : {}),
          occurredAt: op.occurredAt.toISOString(),
          payload: op.payload,
          ...(op.base ? { base: op.base } : {}),
        })),
      });

      const acknowledged: string[] = [];
      const refresh = new Set<string>();
      let unanswered = 0;
      for (const op of batch) {
        const result = results.find((candidate) => candidate.opId === op.opId);
        if (!result) {
          unanswered += 1;
          continue;
        }
        acknowledged.push(op.opId);
        if (isChatOp(op.type)) {
          await this.chatResult(workspaceId, op, result, report);
          continue;
        }
        if (op.type === 'task.delete') {
          await this.deleteResult(workspaceId, op, result, report);
          continue;
        }
        if (result.status === 'applied' && result.task) {
          report.pushed += 1;
          include(report.changes.taskRefs, result.task.ref);
          const before = op.type === 'task.create' ? await this.store.findTask(taskIdOf(op)) : null;
          if (before) include(report.changes.taskRefs, formatTaskRef(before.number));
          await this.store.upsertTask(toTask(result.task));
          if (before && isProvisional(before.number) && !isProvisional(result.task.number)) {
            await this.renumberInChat(workspaceId, before.number, result.task.number, report);
          }
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
          const task = await this.store.findTask(taskIdOf(op));
          await this.rejected(workspaceId, op, result, refresh);
          if (task) include(report.changes.taskRefs, formatTaskRef(task.number));
        }
      }
      await this.store.acknowledge(acknowledged);
      // Best effort: the rejection notice is already recorded; the next pull corrects the rest.
      for (const taskId of refresh) await this.refreshTask(workspaceId, taskId).catch(() => undefined);
      // The server is pacing us (message rate limit): the rest waits for a later cycle.
      if (unanswered > 0) {
        report.deferred += unanswered;
        return;
      }
    }
  }

  private async chatResult(workspaceId: string, op: QueuedOp, result: OpResult, report: SyncReport): Promise<void> {
    if (result.status === 'applied') {
      if (result.message) {
        await this.store.upsertMessage(result.message);
        include(report.changes.chatMessageChannelIds, result.message.channelId);
      }
      if (result.read) {
        await this.store.markRead(result.read.channelId, result.read.lastReadSeq);
        report.changes.chatReads = true;
        include(report.changes.chatChannelIds, result.read.channelId);
      }
      if (op.type !== 'channel.read') report.pushed += 1;
      return;
    }
    // A refused read mark changes nothing you can see.
    if (op.type === 'channel.read') return;
    report.chatRejected += 1;
    const messageId = String(op.payload['messageId'] ?? '');
    const message = await this.store.findMessage(messageId);
    const channel = message ? await this.store.findChannel(message.channelId) : null;
    if (message) include(report.changes.chatMessageChannelIds, message.channelId);
    const where = channel ? `#${channel.name}` : 'the chat';
    const reason = result.error?.message ?? 'rejected by the server';
    const body = typeof op.payload['body'] === 'string' ? op.payload['body'] : null;
    await this.store.addNotice(workspaceId, {
      id: randomUUID(),
      taskId: null,
      taskRef: where,
      kind: 'rejected',
      field: 'chat',
      // Your text, so the chat can give it back to you.
      overwritten: body,
      message: `${op.type === 'message.send' ? `Message to ${where} not sent` : `Change to a message in ${where} not applied`}: ${reason}`,
    });
    if (op.type === 'message.send') await this.store.deleteMessage(messageId);
    else if (message) await this.refreshMessage(workspaceId, message).catch(() => undefined);
  }

  /** A refused delete (e.g. you are no longer an owner) brings the task back as the server has it. */
  private async deleteResult(workspaceId: string, op: QueuedOp, result: OpResult, report: SyncReport): Promise<void> {
    const number = Number(op.payload['number']);
    const ref = formatTaskRef(number);
    if (result.status === 'applied') {
      report.pushed += 1;
      include(report.changes.taskRefs, ref);
      return;
    }
    report.rejected += 1;
    await this.store.addNotice(workspaceId, {
      id: randomUUID(),
      taskId: op.taskId,
      taskRef: ref,
      kind: 'rejected',
      field: null,
      overwritten: null,
      message: `Could not delete ${ref}: ${result.error?.message ?? 'rejected by the server'}`,
    });
    if (!isProvisional(number)) {
      await this.refreshTaskByRef(workspaceId, ref).catch(() => undefined);
      include(report.changes.taskRefs, ref);
    }
  }

  /** Reloads one message as the server has it (undoing a refused edit or delete). */
  private async refreshMessage(workspaceId: string, message: ChatMessage): Promise<void> {
    if (message.seq === null) return;
    const [server] = await this.api.get<ChatMessage[]>(
      `/v1/workspaces/${workspaceId}/channels/${message.channelId}/messages?before=${message.seq + 1}&limit=1`,
    );
    if (server?.id === message.id) await this.store.upsertMessage(server);
  }

  /** Queued and unsent messages that named `SOJA-?n` now name the real task. */
  private async renumberInChat(workspaceId: string, provisional: number, number: number, report: SyncReport): Promise<void> {
    const pattern = provisionalRefPattern(provisional);
    const ref = formatTaskRef(number);
    for (const op of await this.store.pending(workspaceId)) {
      const body = op.payload['body'];
      if (!isChatOp(op.type) || typeof body !== 'string' || !pattern.test(body)) continue;
      pattern.lastIndex = 0;
      await this.store.updateQueuedPayload(op.opId, { ...op.payload, body: body.replace(pattern, ref) });
      const messageId = String(op.payload['messageId'] ?? '');
      const message = await this.store.findMessage(messageId);
      if (message && message.seq === null) {
        await this.store.patchMessage(messageId, { body: body.replace(pattern, ref) });
        include(report.changes.chatMessageChannelIds, message.channelId);
      }
    }
  }

  private async rejected(workspaceId: string, op: QueuedOp, result: OpResult, refresh: Set<string>): Promise<void> {
    const taskId = taskIdOf(op);
    const task = await this.store.findTask(taskId);
    const ref = task ? formatTaskRef(task.number) : 'a task';
    await this.store.addNotice(workspaceId, {
      id: randomUUID(),
      taskId: op.type === 'task.create' ? null : taskId,
      taskRef: ref,
      kind: 'rejected',
      field: null,
      overwritten: null,
      message: `${op.type === 'task.create' ? `Could not create ${ref}` : `A change to ${ref} was not applied`}: ${result.error?.message ?? 'rejected by the server'}`,
    });
    // A task the server never accepted must not linger; other rejections are undone by reloading the task.
    if (op.type === 'task.create') await this.store.deleteTask(taskId);
    else refresh.add(taskId);
  }

  private async refreshTask(workspaceId: string, taskId: string): Promise<void> {
    const task = await this.store.findTask(taskId);
    if (!task || isProvisional(task.number)) return;
    await this.refreshTaskByRef(workspaceId, formatTaskRef(task.number));
  }

  private async refreshTaskByRef(workspaceId: string, ref: string): Promise<void> {
    const details = await this.api.get<{ task: TaskView; comments: TaskComment[]; activity: TaskActivity[] }>(
      `/v1/workspaces/${workspaceId}/tasks/${ref}`,
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
      if (batch.members.length) report.changes.members = true;
      for (const project of batch.projects) await this.store.upsertProject(project);
      if (batch.projects.length) report.changes.projects = true;
      for (const task of batch.tasks) {
        await this.store.upsertTask(toTask(task));
        include(report.changes.taskRefs, task.ref);
      }
      for (const comment of batch.comments) {
        await this.store.upsertComment(comment);
        const task = await this.store.findTask(comment.taskId);
        if (task) include(report.changes.taskRefs, formatTaskRef(task.number));
      }
      for (const activity of batch.activity) {
        await this.store.upsertActivity(activity);
        const task = await this.store.findTask(activity.taskId);
        if (task) include(report.changes.taskRefs, formatTaskRef(task.number));
      }
      for (const channel of batch.channels ?? []) {
        await this.store.upsertChannel(channel);
        include(report.changes.chatChannelIds, channel.id);
      }
      for (const message of batch.messages ?? []) {
        await this.store.upsertMessage(message);
        include(report.changes.chatMessageChannelIds, message.channelId);
      }
      for (const read of batch.reads ?? []) {
        await this.store.markRead(read.channelId, read.lastReadSeq);
        report.changes.chatReads = true;
        include(report.changes.chatChannelIds, read.channelId);
      }
      for (const taskId of batch.deletedTasks ?? []) {
        const task = await this.store.findTask(taskId);
        if (task) include(report.changes.taskRefs, formatTaskRef(task.number));
        await this.store.deleteTask(taskId);
      }
      report.pulledTasks += batch.tasks.length;
      report.pulledMessages += batch.messages?.length ?? 0;
      cursor = batch.cursor;
      await this.store.saveState(workspaceId, { cursor });
      if (!batch.hasMore) return;
    }
  }

  /** Server rows may predate queued edits; put the queued field values back on top. */
  private async reapplyPending(workspaceId: string): Promise<void> {
    for (const op of await this.store.pending(workspaceId)) {
      const messageId = String(op.payload['messageId'] ?? '');
      if (op.type === 'task.change') {
        const fields: Partial<Task> = Object.fromEntries(Object.entries(op.payload).filter(([field]) => TASK_FIELDS.has(field)));
        if (typeof op.payload['archived'] === 'boolean') fields.archivedAt = op.payload['archived'] ? op.occurredAt : null;
        await this.store.patchTask(taskIdOf(op), fields);
      } else if (op.type === 'message.edit') {
        await this.store.patchMessage(messageId, { body: String(op.payload['body'] ?? ''), editedAt: op.occurredAt });
      } else if (op.type === 'message.delete') {
        await this.store.patchMessage(messageId, { body: '', deletedAt: op.occurredAt });
      }
    }
  }

  /**
   * Applies a chat event from the live connection right away. Returns true
   * when the caller should run a sync instead (the event only says "changed").
   */
  async receive(workspaceId: string, event: LiveEvent): Promise<boolean> {
    switch (event.type) {
      case 'changes.available':
        return true;
      case 'message.created':
      case 'message.updated':
        if (event.message.workspaceId !== workspaceId) return false;
        await this.store.upsertMessage(event.message);
        break;
      case 'channel.created':
      case 'channel.updated':
        if (event.channel.workspaceId !== workspaceId) return false;
        await this.store.upsertChannel(event.channel);
        break;
    }
    await this.reapplyPending(workspaceId);
    this.online = true;
    const report = { ...emptyReport(), live: true, pulledMessages: event.type.startsWith('message.') ? 1 : 0 };
    switch (event.type) {
      case 'message.created':
      case 'message.updated':
        include(report.changes.chatMessageChannelIds, event.message.channelId);
        break;
      case 'channel.created':
      case 'channel.updated':
        include(report.changes.chatChannelIds, event.channel.id);
        break;
    }
    this.emit(report);
    return false;
  }

  private emit(report: SyncReport | null): void {
    for (const listener of this.listeners) listener(report);
  }
}

function describe(value: unknown): string {
  if (value === null || value === undefined || value === '') return '(empty)';
  return typeof value === 'string' ? `“${value}”` : JSON.stringify(value);
}
