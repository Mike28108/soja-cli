import { describe, expect, it } from 'vitest';
import { layoutTaskColumns } from '../../src/ui/components/task-columns.js';
import { navigate, type Route } from '../../src/ui/navigation/routes.js';
import { wrapText, clampLines } from '../../src/utils/text.js';
import { formatRelative, formatStamp } from '../../src/utils/time.js';

describe('layoutTaskColumns', () => {
  it('shows everything on wide terminals', () => {
    const columns = layoutTaskColumns(140, { showAssignee: true, refWidth: 8 });
    expect(columns.project).toBeGreaterThan(0);
    expect(columns.assignee).toBeGreaterThan(0);
    expect(columns.statusGlyphOnly).toBe(false);
  });

  it('drops assignee, then status labels, then project as the terminal narrows', () => {
    expect(layoutTaskColumns(90, { showAssignee: true, refWidth: 8 }).assignee).toBe(0);
    const medium = layoutTaskColumns(70, { showAssignee: true, refWidth: 8 });
    expect(medium.statusGlyphOnly).toBe(true);
    expect(medium.project).toBeGreaterThan(0);
    const small = layoutTaskColumns(50, { showAssignee: true, refWidth: 8 });
    expect(small.project).toBe(0);
    expect(small.title).toBeGreaterThanOrEqual(10);
  });
});

describe('navigation stack', () => {
  const home: Route = { name: 'home' };
  it('pushes, pops and never pops past home', () => {
    let stack = navigate([home], { type: 'push', route: { name: 'task', ref: 'SOJA-1' } });
    expect(stack).toHaveLength(2);
    stack = navigate(stack, { type: 'push', route: { name: 'task', ref: 'SOJA-1' } });
    expect(stack).toHaveLength(2);
    stack = navigate(navigate(stack, { type: 'pop' }), { type: 'pop' });
    expect(stack).toEqual([home]);
  });

  it('resets to home or to home plus a destination', () => {
    const deep: Route[] = [home, { name: 'projects' }, { name: 'project', projectId: 'p' }];
    expect(navigate(deep, { type: 'reset' })).toEqual([home]);
    expect(navigate(deep, { type: 'reset', route: { name: 'home', filter: 'blocked' } })).toEqual([
      { name: 'home', filter: 'blocked' },
    ]);
    expect(navigate(deep, { type: 'reset', route: { name: 'help' } })).toEqual([home, { name: 'help' }]);
  });
});

describe('text and time helpers', () => {
  it('wraps words and clamps with an ellipsis', () => {
    expect(wrapText('Stripe webhook is generating duplicate payment events', 20)).toEqual([
      'Stripe webhook is',
      'generating duplicate',
      'payment events',
    ]);
    expect(clampLines(['a', 'b', 'c'], 2)).toEqual(['a', 'b…']);
  });

  it('formats timestamps relative to now', () => {
    const now = new Date(2026, 8, 24, 12, 0);
    expect(formatStamp(new Date(2026, 8, 24, 10, 42), now)).toBe('10:42');
    expect(formatStamp(new Date(2026, 8, 22, 10, 42), now)).toBe('Sep 22');
    expect(formatStamp(new Date(2025, 8, 22), now)).toBe('Sep 22 2025');
    expect(formatRelative(new Date(2026, 8, 24, 11, 55), now)).toBe('5m ago');
    expect(formatRelative(new Date(2026, 8, 24, 9, 0), now)).toBe('3h ago');
  });
});
