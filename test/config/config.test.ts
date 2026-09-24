import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { FileConfigStore } from '../../src/config/config.js';
import { resolvePaths } from '../../src/config/paths.js';
import { ConfigError } from '../../src/domain/errors.js';
import { tempDir } from '../helpers.js';

describe('resolvePaths', () => {
  it('follows XDG variables', () => {
    const paths = resolvePaths({ XDG_DATA_HOME: '/data', XDG_CONFIG_HOME: '/conf' }, '/home/dev');
    expect(paths).toEqual({
      dataDir: '/data/soja',
      configDir: '/conf/soja',
      databaseFile: '/data/soja/soja.db',
      configFile: '/conf/soja/config.json',
      credentialsFile: '/conf/soja/credentials.json',
    });
  });

  it('falls back to ~/.local/share and ~/.config (relative XDG values are ignored per spec)', () => {
    const paths = resolvePaths({ XDG_DATA_HOME: 'relative' }, '/home/dev');
    expect(paths.databaseFile).toBe('/home/dev/.local/share/soja/soja.db');
    expect(paths.configFile).toBe('/home/dev/.config/soja/config.json');
  });
});

describe('FileConfigStore', () => {
  let dir: ReturnType<typeof tempDir>;
  afterEach(() => dir.cleanup());

  it('returns null when there is no file and round-trips a saved config', () => {
    dir = tempDir();
    const store = new FileConfigStore(join(dir.path, 'nested', 'config.json'));
    expect(store.load()).toBeNull();
    store.save({ mode: 'local', userId: 'u', workspaceId: 'w', parentFolders: ['/code/products'] });
    expect(store.load()).toEqual({ mode: 'local', userId: 'u', workspaceId: 'w', parentFolders: ['/code/products'] });
  });

  it('reads v0.1 config files, which have no parent folders', () => {
    dir = tempDir();
    const file = join(dir.path, 'config.json');
    writeFileSync(file, JSON.stringify({ mode: 'local', userId: 'u', workspaceId: 'w' }));
    expect(new FileConfigStore(file).load()?.parentFolders).toEqual([]);
  });

  it('explains broken JSON instead of crashing', () => {
    dir = tempDir();
    const file = join(dir.path, 'config.json');
    writeFileSync(file, '{ nope');
    expect(() => new FileConfigStore(file).load()).toThrow(ConfigError);
    expect(() => new FileConfigStore(file).load()).toThrow(/not valid JSON/);
  });

  it('explains remote mode without a server', () => {
    dir = tempDir();
    const file = join(dir.path, 'config.json');
    writeFileSync(file, JSON.stringify({ mode: 'remote' }));
    expect(() => new FileConfigStore(file).load()).toThrow('Remote mode is set but no server is configured.');
  });

  it('keeps the local session next to the remote settings', () => {
    dir = tempDir();
    const file = join(dir.path, 'config.json');
    const config = {
      mode: 'remote' as const,
      userId: 'u',
      workspaceId: 'w',
      parentFolders: [],
      remote: { apiUrl: 'https://api.soja.dev', userId: 'ru', workspaceId: 'rw' },
    };
    writeFileSync(file, JSON.stringify(config));
    expect(new FileConfigStore(file).load()).toEqual(config);
  });
});

describe('server URL normalization', () => {
  it('accepts the URL people paste, including the health path', async () => {
    const { normalize } = await import('../../src/config/credentials.js');
    expect(normalize('https://soja.up.railway.app/v1/health')).toBe('https://soja.up.railway.app');
    expect(normalize('https://soja.up.railway.app/v1/')).toBe('https://soja.up.railway.app');
    expect(normalize('https://soja.up.railway.app/')).toBe('https://soja.up.railway.app');
    expect(normalize(' https://soja.up.railway.app ')).toBe('https://soja.up.railway.app');
    expect(normalize('http://localhost:8787/api/v1/health')).toBe('http://localhost:8787/api');
  });
});
