import { describe, expect, it } from 'vitest';
import { planStatusChange } from '../../src/domain/workflow.js';

const now = new Date('2026-09-24T10:00:00Z');
const earlier = new Date('2026-09-20T10:00:00Z');
const fresh = { startedAt: null, completedAt: null };

describe('planStatusChange', () => {
  it('does nothing when the status does not change', () => {
    expect(planStatusChange({ status: 'todo', ...fresh }, 'todo', now)).toBeNull();
  });

  it('stamps startedAt the first time work starts', () => {
    const change = planStatusChange({ status: 'todo', ...fresh }, 'in_progress', now);
    expect(change?.patch).toEqual({ status: 'in_progress', startedAt: now, completedAt: null });
    expect(change?.event).toEqual({ type: 'status_changed', metadata: { from: 'todo', to: 'in_progress' } });
  });

  it('keeps the original startedAt when work resumes', () => {
    const change = planStatusChange({ status: 'blocked', startedAt: earlier, completedAt: null }, 'in_progress', now);
    expect(change?.patch.startedAt).toBe(earlier);
  });

  it('records completion when moving to done', () => {
    const change = planStatusChange({ status: 'review', startedAt: earlier, completedAt: null }, 'done', now);
    expect(change?.patch).toEqual({ status: 'done', startedAt: earlier, completedAt: now });
    expect(change?.event).toEqual({ type: 'task_completed', metadata: { from: 'review' } });
  });

  it('records a reopen and clears completedAt when leaving done', () => {
    const change = planStatusChange({ status: 'done', startedAt: earlier, completedAt: earlier }, 'todo', now);
    expect(change?.patch).toEqual({ status: 'todo', startedAt: earlier, completedAt: null });
    expect(change?.event).toEqual({ type: 'task_reopened', metadata: { from: 'done', to: 'todo' } });
  });

  it('does not treat cancelled as completed', () => {
    const change = planStatusChange({ status: 'done', startedAt: earlier, completedAt: earlier }, 'cancelled', now);
    expect(change?.patch.completedAt).toBeNull();
    expect(change?.event.type).toBe('status_changed');
  });
});
