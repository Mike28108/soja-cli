import { afterEach, describe, expect, it } from 'vitest';
import { ConflictError, NotFoundError } from '../../src/domain/errors.js';
import { createSetUpApp, type TestApp } from '../helpers.js';
import type { Session } from '../../src/application/types.js';

let app: TestApp & { session: Session };
afterEach(() => app?.close());

describe('ProjectService', () => {
  it('derives unique keys and rejects duplicate names', async () => {
    app = await createSetUpApp();
    const { projects } = app.services;
    expect((await projects.create(app.session, { name: 'Taskfeeds' })).key).toBe('TASK');
    expect((await projects.create(app.session, { name: 'Task Tracker' })).key).toBe('TASK2');
    expect((await projects.create(app.session, { name: 'Mediacore', key: 'media' })).key).toBe('MEDIA');
    await expect(projects.create(app.session, { name: 'taskfeeds' })).rejects.toThrow(ConflictError);
    await expect(projects.create(app.session, { name: 'Other', key: 'MEDIA' })).rejects.toThrow(ConflictError);
    await expect(projects.create(app.session, { name: 'Bad', key: '1X' })).rejects.toThrow(/Keys/);
  });

  it('resolves by key or name', async () => {
    app = await createSetUpApp();
    const created = await app.services.projects.create(app.session, { name: 'EnrollBridge' });
    expect((await app.services.projects.resolve(app.session, 'enroll')).id).toBe(created.id);
    expect((await app.services.projects.resolve(app.session, 'enrollbridge')).id).toBe(created.id);
    await expect(app.services.projects.resolve(app.session, 'nothing')).rejects.toThrow(NotFoundError);
  });

  it('summarizes task counts per project', async () => {
    app = await createSetUpApp();
    const { projects, tasks } = app.services;
    const spring = await projects.create(app.session, { name: 'SPRING' });
    await projects.create(app.session, { name: 'Empty' });
    await tasks.create(app.session, { title: 'A', projectId: spring.id });
    await tasks.create(app.session, { title: 'B', projectId: spring.id, status: 'blocked' });
    await tasks.create(app.session, { title: 'C', projectId: spring.id, status: 'done' });
    await tasks.create(app.session, { title: 'D', projectId: spring.id, status: 'backlog' });

    const [empty, summary] = await projects.list(app.session);
    expect(empty?.active).toBe(0);
    expect(summary?.name).toBe('SPRING');
    expect(summary?.active).toBe(2);
    expect(summary?.counts).toMatchObject({ todo: 1, blocked: 1, done: 1, backlog: 1 });
  });
});
