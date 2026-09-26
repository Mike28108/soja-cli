import { sql } from 'drizzle-orm';
import { check, index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import type { ActivityPayloads } from '../domain/activity.js';
import { ACTIVITY_TYPES } from '../domain/activity.js';
import { WORKSPACE_ROLES } from '../domain/entities.js';
import { TASK_PRIORITIES, TASK_STATUSES, TASK_TYPES } from '../domain/task.js';

const timestamps = {
  createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' }).notNull(),
};

const oneOf = (column: string, values: readonly string[]) =>
  sql.raw(`${column} IN (${values.map((value) => `'${value}'`).join(', ')})`);

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  username: text('username').notNull().unique(),
  displayName: text('display_name').notNull(),
  email: text('email'),
  ...timestamps,
});

export const workspaces = sqliteTable('workspaces', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  description: text('description'),
  /** Highest task number ever deleted, so numbers are never reused (old commits keep pointing at the right task). */
  lastDeletedNumber: integer('last_deleted_number').notNull().default(0),
  ...timestamps,
});

export const workspaceMembers = sqliteTable(
  'workspace_members',
  {
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role', { enum: WORKSPACE_ROLES }).notNull(),
    designated: integer('designated', { mode: 'boolean' }).notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.workspaceId, t.userId] }), check('workspace_members_role', oneOf('role', WORKSPACE_ROLES))],
);

export const projects = sqliteTable(
  'projects',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    key: text('key').notNull(),
    description: text('description'),
    repositoryUrl: text('repository_url'),
    repositoryPath: text('repository_path'),
    ...timestamps,
  },
  (t) => [uniqueIndex('projects_workspace_key').on(t.workspaceId, t.key)],
);

export const tasks = sqliteTable(
  'tasks',
  {
    id: text('id').primaryKey(),
    number: integer('number').notNull(),
    workspaceId: text('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    projectId: text('project_id').references(() => projects.id, { onDelete: 'set null' }),
    title: text('title').notNull(),
    description: text('description'),
    type: text('type', { enum: TASK_TYPES }).notNull(),
    priority: text('priority', { enum: TASK_PRIORITIES }).notNull(),
    status: text('status', { enum: TASK_STATUSES }).notNull(),
    assigneeId: text('assignee_id').references(() => users.id, { onDelete: 'set null' }),
    creatorId: text('creator_id')
      .notNull()
      .references(() => users.id),
    requester: text('requester'),
    remunerated: integer('remunerated', { mode: 'boolean' }).notNull().default(false),
    priceMinor: integer('price_minor'),
    currencyCode: text('currency_code'),
    externalApprovalStatus: text('external_approval_status', { enum: ['pending', 'approved', 'rejected'] }),
    branch: text('branch'),
    baseBranch: text('base_branch'),
    branchStart: text('branch_start'),
    ...timestamps,
    startedAt: integer('started_at', { mode: 'timestamp_ms' }),
    completedAt: integer('completed_at', { mode: 'timestamp_ms' }),
    archivedAt: integer('archived_at', { mode: 'timestamp_ms' }),
  },
  (t) => [
    uniqueIndex('tasks_workspace_number').on(t.workspaceId, t.number),
    index('tasks_workspace_status').on(t.workspaceId, t.status),
    index('tasks_assignee').on(t.assigneeId),
    index('tasks_project').on(t.projectId),
    check('tasks_type', oneOf('type', TASK_TYPES)),
    check('tasks_priority', oneOf('priority', TASK_PRIORITIES)),
    check('tasks_status', oneOf('status', TASK_STATUSES)),
    check('tasks_price_nonnegative', sql.raw('price_minor IS NULL OR price_minor >= 0')),
    check('tasks_remuneration_fields', sql.raw('(remunerated = 0 AND price_minor IS NULL AND currency_code IS NULL) OR (remunerated = 1 AND price_minor IS NOT NULL AND currency_code IS NOT NULL)')),
  ],
);

export const taskComments = sqliteTable(
  'task_comments',
  {
    id: text('id').primaryKey(),
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    body: text('body').notNull(),
    ...timestamps,
  },
  (t) => [index('task_comments_task').on(t.taskId)],
);

export const taskActivity = sqliteTable(
  'task_activity',
  {
    id: text('id').primaryKey(),
    taskId: text('task_id')
      .notNull()
      .references(() => tasks.id, { onDelete: 'cascade' }),
    userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
    type: text('type', { enum: ACTIVITY_TYPES }).notNull(),
    metadata: text('metadata', { mode: 'json' }).$type<ActivityPayloads[keyof ActivityPayloads]>().notNull(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (t) => [index('task_activity_task').on(t.taskId), check('task_activity_type', oneOf('type', ACTIVITY_TYPES))],
);

// ── Remote mode replica (v0.4 offline sync). Unused in local mode. ─────────

/** Operations waiting to be sent to the SOJA server, in the order they were made. */
export const syncOutbox = sqliteTable(
  'sync_outbox',
  {
    seq: integer('seq').primaryKey({ autoIncrement: true }),
    opId: text('op_id').notNull().unique(),
    workspaceId: text('workspace_id').notNull(),
    type: text('type').notNull(),
    /** The task a task operation changes; null for chat operations. */
    taskId: text('task_id'),
    payload: text('payload', { mode: 'json' }).$type<Record<string, unknown>>().notNull(),
    base: text('base', { mode: 'json' }).$type<Record<string, unknown>>(),
    occurredAt: integer('occurred_at', { mode: 'timestamp_ms' }).notNull(),
    attempts: integer('attempts').notNull().default(0),
    lastError: text('last_error'),
  },
  (t) => [index('sync_outbox_workspace').on(t.workspaceId, t.seq)],
);

/** Activity rows written optimistically for an operation; replaced by the server's once acknowledged. */
export const syncPendingActivity = sqliteTable('sync_pending_activity', {
  activityId: text('activity_id').primaryKey(),
  opId: text('op_id').notNull(),
});

/** Pull cursor per workspace. */
export const syncState = sqliteTable('sync_state', {
  workspaceId: text('workspace_id').primaryKey(),
  cursor: integer('cursor').notNull().default(0),
  lastSyncAt: integer('last_sync_at', { mode: 'timestamp_ms' }),
  lastError: text('last_error'),
});

/** Conflicts and rejections the user should see. */
export const syncNotices = sqliteTable(
  'sync_notices',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id').notNull(),
    taskId: text('task_id'),
    taskRef: text('task_ref').notNull(),
    kind: text('kind', { enum: ['conflict', 'rejected'] }).notNull(),
    message: text('message').notNull(),
    field: text('field'),
    /** For conflicts: the value your change replaced, to restore it. */
    overwritten: text('overwritten', { mode: 'json' }).$type<unknown>(),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    dismissedAt: integer('dismissed_at', { mode: 'timestamp_ms' }),
  },
  (t) => [index('sync_notices_workspace').on(t.workspaceId)],
);

// ── Chat replica (v0.5, remote mode only) ───────────────────────────────────

export const chatChannels = sqliteTable(
  'chat_channels',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id').notNull(),
    name: text('name').notNull(),
    topic: text('topic'),
    createdBy: text('created_by'),
    ...timestamps,
    archivedAt: integer('archived_at', { mode: 'timestamp_ms' }),
  },
  (t) => [index('chat_channels_workspace').on(t.workspaceId, t.name)],
);

export const chatMessages = sqliteTable(
  'chat_messages',
  {
    id: text('id').primaryKey(),
    /** Server order; null while the message waits in the outbox. */
    seq: integer('seq'),
    workspaceId: text('workspace_id').notNull(),
    channelId: text('channel_id').notNull(),
    authorId: text('author_id'),
    body: text('body').notNull(),
    replyToId: text('reply_to_id'),
    createdAt: integer('created_at', { mode: 'timestamp_ms' }).notNull(),
    editedAt: integer('edited_at', { mode: 'timestamp_ms' }),
    deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
  },
  (t) => [index('chat_messages_channel').on(t.channelId, t.seq), index('chat_messages_workspace').on(t.workspaceId)],
);

/** How far you have read each channel (yours only). */
export const chatReads = sqliteTable('chat_reads', {
  channelId: text('channel_id').primaryKey(),
  lastReadSeq: integer('last_read_seq').notNull().default(0),
});
