import { afterEach, describe, expect, it } from 'vitest';
import { ValidationError } from '../../src/domain/errors.js';
import { createTestApp, type TestApp } from '../helpers.js';

let app: TestApp;
afterEach(() => app?.close());

describe('first-run setup', () => {
  it('needs setup when there is no config', async () => {
    app = await createTestApp();
    expect(await app.services.session.current()).toBeNull();
  });

  it('creates the user, workspace and owner membership, and persists the session', async () => {
    app = await createTestApp();
    const session = await app.services.session.setup({
      displayName: ' Michael ',
      username: 'Michael',
      workspaceName: 'Bravos Development',
    });

    expect(session.user).toMatchObject({ username: 'michael', displayName: 'Michael' });
    expect(session.workspace).toMatchObject({ name: 'Bravos Development', slug: 'bravos-development' });
    expect(app.config.load()).toEqual({
      mode: 'local',
      userId: session.user.id,
      workspaceId: session.workspace.id,
      parentFolders: [],
    });

    const members = await app.services.workspaces.members(session);
    expect(members).toMatchObject([{ username: 'michael', role: 'owner' }]);

    const current = await app.services.session.current();
    expect(current?.user.id).toBe(session.user.id);
    expect(current?.workspace.id).toBe(session.workspace.id);
  });

  it('reuses an existing user and workspace when setup runs again', async () => {
    app = await createTestApp();
    const first = await app.services.session.setup({ displayName: 'M', username: 'michael', workspaceName: 'Personal' });
    const second = await app.services.session.setup({ displayName: 'M', username: 'michael', workspaceName: 'personal' });
    expect(second.user.id).toBe(first.user.id);
    expect(second.workspace.id).toBe(first.workspace.id);
  });

  it('rejects invalid usernames with a readable message', async () => {
    app = await createTestApp();
    await expect(
      app.services.session.setup({ displayName: 'M', username: 'not valid!', workspaceName: 'W' }),
    ).rejects.toThrow(ValidationError);
  });
});

describe('workspaces', () => {
  it('creates more workspaces, switches between them and remembers the choice', async () => {
    app = await createTestApp();
    const session = await app.services.session.setup({ displayName: 'M', username: 'michael', workspaceName: 'Personal' });
    const freelance = await app.services.workspaces.create(session.user, { name: 'Freelance' });
    const dupe = await app.services.workspaces.create(session.user, { name: 'Freelance' });
    expect(dupe.slug).toBe('freelance-2');

    const switched = await app.services.workspaces.switchTo(session.user, 'freelance');
    expect(switched.workspace.id).toBe(freelance.id);
    expect(app.config.load()?.workspaceId).toBe(freelance.id);
    expect((await app.services.workspaces.list(session.user)).map((w) => w.name)).toEqual([
      'Freelance',
      'Freelance',
      'Personal',
    ]);
  });

  it('adds developers as members and refuses duplicates', async () => {
    app = await createTestApp();
    const session = await app.services.session.setup({ displayName: 'M', username: 'michael', workspaceName: 'W' });
    await app.services.workspaces.addMember(session, { username: 'angel', displayName: 'Angel' });
    await expect(app.services.workspaces.addMember(session, { username: 'angel' })).rejects.toThrow(/already/);
    expect((await app.services.workspaces.findMember(session, '@Angel')).displayName).toBe('Angel');
  });

  it('refuses to switch into a workspace the user does not belong to', async () => {
    app = await createTestApp();
    const session = await app.services.session.setup({ displayName: 'M', username: 'michael', workspaceName: 'W' });
    await expect(app.services.workspaces.switchTo(session.user, 'nope')).rejects.toThrow(/not a member/);
  });
});
