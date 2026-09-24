import type { TaskQuery } from '../data/repositories.js';
import type { TaskStatus } from '../domain/task.js';
import type { Session } from './types.js';

export const TASK_FILTERS = ['mine', 'all', 'todo', 'in_progress', 'review', 'blocked', 'done'] as const;
export type TaskFilter = (typeof TASK_FILTERS)[number];

export const FILTER_LABELS: Record<TaskFilter, string> = {
  mine: 'My Tasks',
  all: 'All Tasks',
  todo: 'Todo',
  in_progress: 'In Progress',
  review: 'Review',
  blocked: 'Blocked',
  done: 'Done',
};

const OPEN_STATUSES: readonly TaskStatus[] = ['backlog', 'todo', 'in_progress', 'review', 'blocked'];

/** Turns a named filter into a repository query. Status filters span the whole workspace. */
export function filterToQuery(session: Session, filter: TaskFilter): TaskQuery {
  const workspaceId = session.workspace.id;
  switch (filter) {
    case 'mine':
      return { workspaceId, assigneeId: session.user.id, statuses: OPEN_STATUSES };
    case 'all':
      return { workspaceId, statuses: OPEN_STATUSES };
    default:
      return { workspaceId, statuses: [filter] };
  }
}
