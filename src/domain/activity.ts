import type { TaskPriority, TaskStatus } from './task.js';

/** Plain-text task fields whose edits are recorded as `task_updated`. */
export type TaskTextField = 'title' | 'description' | 'type' | 'requester' | 'branch';

export interface ActivityPayloads {
  task_created: Record<string, never>;
  task_updated: { field: TaskTextField; from: string | null; to: string | null };
  status_changed: { from: TaskStatus; to: TaskStatus };
  assigned: { from: string | null; to: string };
  unassigned: { from: string };
  priority_changed: { from: TaskPriority; to: TaskPriority };
  project_changed: { from: string | null; to: string | null };
  comment_added: { commentId: string };
  task_completed: { from: TaskStatus };
  task_reopened: { from: TaskStatus; to: TaskStatus };
}

export type ActivityType = keyof ActivityPayloads;

export const ACTIVITY_TYPES = [
  'task_created',
  'task_updated',
  'status_changed',
  'assigned',
  'unassigned',
  'priority_changed',
  'project_changed',
  'comment_added',
  'task_completed',
  'task_reopened',
] as const satisfies readonly ActivityType[];

/** An event before it is persisted. Discriminated on `type` so metadata stays typed. */
export type ActivityEvent = {
  [T in ActivityType]: { type: T; metadata: ActivityPayloads[T] };
}[ActivityType];

export type TaskActivity = ActivityEvent & {
  id: string;
  taskId: string;
  userId: string | null;
  createdAt: Date;
};
