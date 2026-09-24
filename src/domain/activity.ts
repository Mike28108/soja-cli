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
  git_committed: { hash: string; subject: string; files: number };
  git_merged: { branch: string; into: string; hash: string | null };
  git_branch_deleted: { branch: string; merged: boolean };
  git_pushed: { branch: string; remote: string };
  pr_opened: { url: string };
  /** A merge done outside SOJA (another tool, an agent, GitHub + pull) was found in the base branch. */
  git_merge_detected: { branch: string; into: string; hash: string | null };
  /** The task's pull request was merged on GitHub, from SOJA (`soja`) or elsewhere (`github`). */
  pr_merged: { number: number; url: string; into: string; via: 'soja' | 'github' };
  /** Checks failed on the pull request's latest commit (recorded once per commit). */
  pr_checks_failed: { number: number; url: string; sha: string; checks: string[] };
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
  'git_committed',
  'git_merged',
  'git_branch_deleted',
  'git_pushed',
  'pr_opened',
  'git_merge_detected',
  'pr_merged',
  'pr_checks_failed',
] as const satisfies readonly ActivityType[];

/** An event before it is persisted. Discriminated on `type` so metadata stays typed. */
export type ActivityEvent = {
  [T in ActivityType]: { type: T; metadata: ActivityPayloads[T] };
}[ActivityType];

/** Events that describe something done in Git on a developer's machine. */
export type GitActivityEvent = Extract<
  ActivityEvent,
  {
    type: 'git_committed' | 'git_merged' | 'git_branch_deleted' | 'git_pushed' | 'pr_opened' | 'git_merge_detected' | 'pr_merged' | 'pr_checks_failed';
  }
>;

export type TaskActivity = ActivityEvent & {
  id: string;
  taskId: string;
  userId: string | null;
  createdAt: Date;
};
