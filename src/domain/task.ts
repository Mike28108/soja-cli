export const TASK_TYPES = [
  'bug',
  'feature',
  'improvement',
  'maintenance',
  'infra',
  'refactor',
  'research',
  'chore',
] as const;
export type TaskType = (typeof TASK_TYPES)[number];

export const TASK_PRIORITIES = ['none', 'low', 'medium', 'high', 'urgent'] as const;
export type TaskPriority = (typeof TASK_PRIORITIES)[number];

export const TASK_STATUSES = [
  'backlog',
  'todo',
  'in_progress',
  'review',
  'blocked',
  'done',
  'cancelled',
] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TYPE_LABELS: Record<TaskType, string> = {
  bug: 'Bug',
  feature: 'Feature',
  improvement: 'Improvement',
  maintenance: 'Maintenance',
  infra: 'Infra',
  refactor: 'Refactor',
  research: 'Research',
  chore: 'Chore',
};

export const PRIORITY_LABELS: Record<TaskPriority, string> = {
  none: 'NONE',
  low: 'LOW',
  medium: 'MED',
  high: 'HIGH',
  urgent: 'URGENT',
};

export const STATUS_LABELS: Record<TaskStatus, string> = {
  backlog: 'Backlog',
  todo: 'Todo',
  in_progress: 'In Progress',
  review: 'Review',
  blocked: 'Blocked',
  done: 'Done',
  cancelled: 'Cancelled',
};

export interface Task {
  id: string;
  number: number;
  workspaceId: string;
  projectId: string | null;
  title: string;
  description: string | null;
  type: TaskType;
  priority: TaskPriority;
  status: TaskStatus;
  assigneeId: string | null;
  creatorId: string;
  requester: string | null;
  branch: string | null;
  createdAt: Date;
  updatedAt: Date;
  startedAt: Date | null;
  completedAt: Date | null;
}

/** Human identifier prefix. Numbers are sequential per workspace. */
export const TASK_REF_PREFIX = 'SOJA';

export function formatTaskRef(number: number): string {
  return `${TASK_REF_PREFIX}-${number}`;
}

/** Accepts `SOJA-12`, `soja-12`, `#12` or `12`. */
export function parseTaskRef(input: string): number | null {
  const match = /^(?:soja-|#)?(\d{1,9})$/i.exec(input.trim());
  if (!match?.[1]) return null;
  const value = Number(match[1]);
  return value > 0 ? value : null;
}

export function isClosed(status: TaskStatus): boolean {
  return status === 'done' || status === 'cancelled';
}

/** Work someone is expected to touch soon: excludes backlog and closed tasks. */
export function isActive(status: TaskStatus): boolean {
  return !isClosed(status) && status !== 'backlog';
}

const STATUS_ORDER: Record<TaskStatus, number> = {
  in_progress: 0,
  review: 1,
  blocked: 2,
  todo: 3,
  backlog: 4,
  done: 5,
  cancelled: 6,
};

const PRIORITY_ORDER: Record<TaskPriority, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
  none: 4,
};

/** "What should I do now" ordering: work in flight first, then by priority, newest first. */
export function compareByUrgency(a: Task, b: Task): number {
  return (
    STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
    PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority] ||
    b.number - a.number
  );
}

export type StatusCounts = Record<TaskStatus, number>;

export function emptyStatusCounts(): StatusCounts {
  return { backlog: 0, todo: 0, in_progress: 0, review: 0, blocked: 0, done: 0, cancelled: 0 };
}

export function countStatuses(tasks: readonly Pick<Task, 'status'>[]): StatusCounts {
  const counts = emptyStatusCounts();
  for (const task of tasks) counts[task.status] += 1;
  return counts;
}

export function activeCount(counts: StatusCounts): number {
  return counts.todo + counts.in_progress + counts.review + counts.blocked;
}

const BRANCH_PREFIX: Record<TaskType, string> = {
  bug: 'fix',
  feature: 'feat',
  improvement: 'feat',
  maintenance: 'chore',
  infra: 'infra',
  refactor: 'refactor',
  research: 'research',
  chore: 'chore',
};

/** Branch name a future `soja start` would create, e.g. `fix/SOJA-342-stripe-webhook`. */
export function suggestBranchName(task: Pick<Task, 'number' | 'type' | 'title'>): string {
  const slug = task.title
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .split('-')
    .slice(0, 5)
    .join('-');
  const base = `${BRANCH_PREFIX[task.type]}/${formatTaskRef(task.number)}`;
  return slug ? `${base}-${slug}` : base;
}
