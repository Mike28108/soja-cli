import type { ActivityEvent } from './activity.js';
import { isClosed, type Task, type TaskStatus } from './task.js';

export interface StatusChange {
  patch: Pick<Task, 'status' | 'startedAt' | 'completedAt'>;
  event: ActivityEvent;
}

/**
 * Rules for moving a task between statuses. Every transition is allowed
 * (teams move fast and fix mistakes), but timestamps and the recorded
 * event depend on where the task is coming from and going to.
 */
export function planStatusChange(
  task: Pick<Task, 'status' | 'startedAt' | 'completedAt'>,
  to: TaskStatus,
  now: Date,
): StatusChange | null {
  const from = task.status;
  if (from === to) return null;

  const startedAt = task.startedAt ?? (to === 'in_progress' ? now : null);
  const patch = { status: to, startedAt, completedAt: task.completedAt };

  if (to === 'done') {
    return { patch: { ...patch, completedAt: now }, event: { type: 'task_completed', metadata: { from } } };
  }
  if (isClosed(from) && !isClosed(to)) {
    return { patch: { ...patch, completedAt: null }, event: { type: 'task_reopened', metadata: { from, to } } };
  }
  return {
    patch: { ...patch, completedAt: to === 'cancelled' ? null : patch.completedAt },
    event: { type: 'status_changed', metadata: { from, to } },
  };
}
