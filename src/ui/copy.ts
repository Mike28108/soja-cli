import type { TaskFilter } from '../application/filters.js';
import type { StatusCounts } from '../domain/task.js';

/** Empty states. First line is the fact; the rest may smile a little. */
export const EMPTY_TASKS: Record<TaskFilter, readonly string[]> = {
  mine: ['No tasks assigned.', "You're free.", 'Press n to ruin that.'],
  all: ['No open tasks in this workspace.', 'Suspiciously peaceful.'],
  todo: ['Nothing waiting in Todo.'],
  in_progress: ['Nothing in progress.', 'Pick something up with s on a task.'],
  review: ['Nothing waiting for review.'],
  blocked: ['Nothing blocked.', 'Keep it that way.'],
  done: ['Nothing done yet.', 'The day is young.'],
};

export const EMPTY_SEARCH = ['Nothing matches.', 'Maybe it is still in a WhatsApp chat.'];
export const EMPTY_PROJECTS = ['No projects yet.', 'Press n to add the first one.'];

/** One dry remark for the summary line, or null. Never more than one. */
export function summaryRemark(counts: StatusCounts): string | null {
  if (counts.blocked >= 3) return 'That is a lot of walls.';
  if (counts.review >= 3) return 'Someone has homework.';
  if (counts.in_progress >= 5) return 'Many plates spinning.';
  return null;
}
