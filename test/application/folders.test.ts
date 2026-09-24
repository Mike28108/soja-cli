import { mkdirSync, realpathSync, symlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Session } from '../../src/application/types.js';
import { ConflictError, NotFoundError, ValidationError } from '../../src/domain/errors.js';
import { createRepo, createSetUpApp, tempDir, type TestApp } from '../helpers.js';

let app: TestApp & { session: Session };
let dir: ReturnType<typeof tempDir>;
let products: string;
let services: string;

beforeEach(async () => {
  dir = tempDir();
  const base = realpathSync(dir.path);
  products = join(base, 'products');
  services = join(base, 'services');
  for (const folder of [products, services, join(products, 'enrollbridge'), join(products, 'spring'), join(products, '.cache'), join(services, 'payments-api'), join(services, 'spring')]) {
    mkdirSync(folder);
  }
  createRepo(join(products, 'enrollbridge'));
  writeFileSync(join(products, 'notes.txt'), 'not a folder');
  app = await createSetUpApp();
});
afterEach(() => {
  app.close();
  dir.cleanup();
});

describe('parent folders', () => {
  it('adds, lists and removes folders, persisting them in the config', () => {
    const { folders } = app.services;
    expect(folders.list()).toEqual([]);
    folders.add(products);
    folders.add(`${services}/`);
    expect(app.config.load()?.parentFolders).toEqual([products, services]);
    expect(() => folders.add(products)).toThrow(ConflictError);
    expect(folders.remove('services')).toEqual([products]);
    expect(() => folders.remove('nope')).toThrow(NotFoundError);
  });

  it('rejects empty, missing and non-folder paths', () => {
    const { folders } = app.services;
    expect(() => folders.add('  ')).toThrow(ValidationError);
    expect(() => folders.add(join(products, 'missing'))).toThrow(/does not exist/);
    expect(() => folders.add(join(products, 'notes.txt'))).toThrow(/not a folder/);
  });

  it('expands ~', () => {
    expect(app.services.folders.add('~')).toEqual([homedir()]);
  });

  it('survives switching workspaces', async () => {
    app.services.folders.add(products);
    const other = await app.services.workspaces.create(app.session.user, { name: 'Personal' });
    await app.services.workspaces.switchTo(app.session.user, other.id);
    expect(app.services.folders.list()).toEqual([products]);
  });
});

describe('browsing', () => {
  it('lists immediate subfolders like ls -1, skipping files and hidden folders, marking Git repositories', () => {
    app.services.folders.add(products);
    app.services.folders.add(services);
    symlinkSync(join(services, 'payments-api'), join(products, 'payments-link'));

    const [front, back] = app.services.folders.browse();
    expect(front?.children.map((child) => [child.name, child.isGitRepository])).toEqual([
      ['enrollbridge', true],
      ['payments-link', false],
      ['spring', false],
    ]);
    expect(front?.children[1]?.path).toBe(join(services, 'payments-api'));
    expect(back?.children.map((child) => child.name)).toEqual(['payments-api', 'spring']);
  });

  it('reports parent folders that disappeared', () => {
    app.services.folders.add(services);
    dir.cleanup();
    expect(app.services.folders.browse()).toEqual([{ path: services, available: false, children: [] }]);
  });

  it('finds a subfolder by name, and asks for a path when the name is ambiguous', () => {
    app.services.folders.add(products);
    app.services.folders.add(services);
    expect(app.services.folders.findChild('enrollbridge').path).toBe(join(products, 'enrollbridge'));
    expect(() => app.services.folders.findChild('spring')).toThrow(/more than one parent folder/);
    expect(() => app.services.folders.findChild('ghost')).toThrow(NotFoundError);
  });
});
