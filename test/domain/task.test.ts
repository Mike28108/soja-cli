import { describe, expect, it } from 'vitest';
import { deriveProjectKey, makeUnique, slugify } from '../../src/domain/naming.js';
import {
  compareByUrgency,
  countStatuses,
  formatTaskRef,
  parseTaskRef,
  suggestBranchName,
  type Task,
} from '../../src/domain/task.js';

describe('task references', () => {
  it('formats and parses human IDs', () => {
    expect(formatTaskRef(342)).toBe('SOJA-342');
    expect(parseTaskRef('SOJA-342')).toBe(342);
    expect(parseTaskRef('soja-7')).toBe(7);
    expect(parseTaskRef('#12')).toBe(12);
    expect(parseTaskRef(' 12 ')).toBe(12);
  });

  it('rejects things that are not task IDs', () => {
    expect(parseTaskRef('stripe')).toBeNull();
    expect(parseTaskRef('SOJA-')).toBeNull();
    expect(parseTaskRef('0')).toBeNull();
    expect(parseTaskRef('ENROLL-3')).toBeNull();
  });
});

describe('suggestBranchName', () => {
  it('builds a git-friendly branch from type, id and title', () => {
    expect(suggestBranchName({ number: 342, type: 'bug', title: 'Fix Stripe webhook duplicate events!' })).toBe(
      'fix/SOJA-342-fix-stripe-webhook-duplicate-events',
    );
    expect(suggestBranchName({ number: 5, type: 'feature', title: 'Añadir velocidad de lanzamiento' })).toBe(
      'feat/SOJA-5-anadir-velocidad-de-lanzamiento',
    );
    expect(suggestBranchName({ number: 9, type: 'chore', title: '!!!' })).toBe('chore/SOJA-9');
  });
});

describe('compareByUrgency', () => {
  const task = (number: number, status: Task['status'], priority: Task['priority']) =>
    ({ number, status, priority }) as Task;

  it('puts work in flight first, then priority, then newest', () => {
    const sorted = [
      task(1, 'todo', 'low'),
      task(2, 'todo', 'urgent'),
      task(3, 'in_progress', 'low'),
      task(4, 'backlog', 'urgent'),
      task(5, 'todo', 'urgent'),
      task(6, 'review', 'none'),
    ].sort(compareByUrgency);
    expect(sorted.map((t) => t.number)).toEqual([3, 6, 5, 2, 1, 4]);
  });
});

describe('countStatuses', () => {
  it('counts every status, including zeros', () => {
    const counts = countStatuses([{ status: 'todo' }, { status: 'todo' }, { status: 'blocked' }]);
    expect(counts).toMatchObject({ todo: 2, blocked: 1, done: 0 });
  });
});

describe('naming', () => {
  it('derives short project keys', () => {
    expect(deriveProjectKey('EnrollBridge')).toBe('ENROLL');
    expect(deriveProjectKey('SPRING')).toBe('SPRING');
    expect(deriveProjectKey('Taskfeeds')).toBe('TASK');
    expect(deriveProjectKey('Banana Gym')).toBe('BANANA');
    expect(deriveProjectKey('Mediacore')).toBe('MEDI');
  });

  it('makes values unique', () => {
    const taken = new Set(['TASK', 'TASK2']);
    expect(makeUnique('TASK', (value) => taken.has(value))).toBe('TASK3');
    expect(makeUnique('personal', () => false)).toBe('personal');
    expect(makeUnique('personal', (value) => value === 'personal', '-')).toBe('personal-2');
  });

  it('slugifies names', () => {
    expect(slugify('Bravos Development')).toBe('bravos-development');
    expect(slugify('  Él Niño & Co. ')).toBe('el-nino-co');
  });
});
