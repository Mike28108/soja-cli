import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Session } from '../../src/application/types.js';
import type { User } from '../../src/domain/entities.js';
import { createSetUpApp, type TestApp } from '../helpers.js';

let app: TestApp & { session: Session };

beforeEach(async () => {
  app = await createSetUpApp();
});
afterEach(() => app.close());

const refs = async (filter: Parameters<TestApp['services']['tasks']['list']>[1]) =>
  (await app.services.tasks.list(app.session, filter)).map((task) => task.ref);

describe('archiving tasks', () => {
  it('hides archived tasks from lists and counts, keeps them searchable, and restores them', async () => {
    const project = await app.services.projects.create(app.session, { name: 'EnrollBridge' });
    await app.services.tasks.create(app.session, { title: 'Old idea', projectId: project.id });
    await app.services.tasks.create(app.session, { title: 'Real work', projectId: project.id });

    const archived = await app.services.tasks.archive(app.session, 'SOJA-1');
    expect(archived.archivedAt).toBeInstanceOf(Date);
    expect(await refs('all')).toEqual(['SOJA-2']);
    expect(await refs('mine')).toEqual(['SOJA-2']);
    expect(await refs('archived')).toEqual(['SOJA-1']);
    expect((await app.services.projects.list(app.session))[0]?.active).toBe(1);
    expect((await app.services.tasks.search(app.session, 'old')).map((task) => task.ref)).toEqual(['SOJA-1']);

    await app.services.tasks.archive(app.session, 'SOJA-1'); // already archived: nothing recorded
    await app.services.tasks.restore(app.session, 'SOJA-1');
    expect(await refs('all')).toEqual(['SOJA-2', 'SOJA-1']);
    const texts = (await app.services.tasks.get(app.session, 'SOJA-1')).timeline.flatMap((entry) => (entry.kind === 'event' ? [entry.text] : []));
    expect(texts).toEqual(['created the task', 'archived the task', 'restored the task from the archive']);
  });
});

describe('deleting tasks', () => {
  it('deletes a task with its comments and timeline, for owners only', async () => {
    await app.services.tasks.create(app.session, { title: 'Mistake' });
    await app.services.tasks.comment(app.session, 'SOJA-1', 'oops');

    const member = await app.services.workspaces.addMember(app.session, { username: 'angel', displayName: 'Angel' });
    const angel: Session = { ...app.session, user: { ...member, email: null, createdAt: new Date(), updatedAt: new Date() } as User };
    await expect(app.services.tasks.remove(angel, 'SOJA-1')).rejects.toThrow(/Only workspace owners/);

    expect(await app.services.tasks.remove(app.session, 'SOJA-1')).toMatchObject({ number: 1 });
    await expect(app.services.tasks.get(app.session, 'SOJA-1')).rejects.toThrow();
    // Numbers are never reused.
    expect((await app.services.tasks.create(app.session, { title: 'Next' })).ref).toBe('SOJA-2');
  });
});
