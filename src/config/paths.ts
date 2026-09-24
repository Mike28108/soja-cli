import { homedir } from 'node:os';
import { join } from 'node:path';

export interface SojaPaths {
  dataDir: string;
  configDir: string;
  databaseFile: string;
  configFile: string;
  credentialsFile: string;
}

type Env = Readonly<Record<string, string | undefined>>;

/** XDG base directories, with the spec's fallbacks when the variables are unset or relative. */
export function resolvePaths(env: Env = process.env, home: string = homedir()): SojaPaths {
  const xdg = (name: string, fallback: string): string => {
    const value = env[name];
    return value && value.startsWith('/') ? value : join(home, fallback);
  };
  const dataDir = join(xdg('XDG_DATA_HOME', '.local/share'), 'soja');
  const configDir = join(xdg('XDG_CONFIG_HOME', '.config'), 'soja');
  return {
    dataDir,
    configDir,
    databaseFile: join(dataDir, 'soja.db'),
    configFile: join(configDir, 'config.json'),
    credentialsFile: join(configDir, 'credentials.json'),
  };
}
