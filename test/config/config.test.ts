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
    store.save({ mode: 'local', userId: 'u', workspaceId: 'w' });
    expect(store.load()).toEqual({ mode: 'local', userId: 'u', workspaceId: 'w' });
  });

  it('explains broken JSON instead of crashing', () => {
    dir = tempDir();
    const file = join(dir.path, 'config.json');
    writeFileSync(file, '{ nope');
    expect(() => new FileConfigStore(file).load()).toThrow(ConfigError);
    expect(() => new FileConfigStore(file).load()).toThrow(/not valid JSON/);
  });

  it('recognizes the future remote mode and says it is not available yet', () => {
    dir = tempDir();
    const file = join(dir.path, 'config.json');
    writeFileSync(file, JSON.stringify({ mode: 'remote', apiUrl: 'https://api.soja.dev' }));
    expect(() => new FileConfigStore(file).load()).toThrow('Remote mode is not available in this version of SOJA.');
  });
});
