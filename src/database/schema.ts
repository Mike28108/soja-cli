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
    branch: text('branch'),
    ...timestamps,
    startedAt: integer('started_at', { mode: 'timestamp_ms' }),
    completedAt: integer('completed_at', { mode: 'timestamp_ms' }),
  },
  (t) => [
    uniqueIndex('tasks_workspace_number').on(t.workspaceId, t.number),
    index('tasks_workspace_status').on(t.workspaceId, t.status),
    index('tasks_assignee').on(t.assigneeId),
    index('tasks_project').on(t.projectId),
    check('tasks_type', oneOf('type', TASK_TYPES)),
    check('tasks_priority', oneOf('priority', TASK_PRIORITIES)),
    check('tasks_status', oneOf('status', TASK_STATUSES)),
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
