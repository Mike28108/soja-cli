import { FileConfigStore, type ConfigStore } from './config/config.js';
import { resolvePaths, type SojaPaths } from './config/paths.js';
import { createServices, type AppServices } from './application/services/index.js';
import { createLocalRepositories } from './data/local/index.js';
import { openDatabase } from './database/client.js';
import { runMigrations } from './database/migrate.js';
import { CliGit } from './git/cli-git.js';
import { GitConsole } from './git/console.js';
import { CredentialStore } from './config/credentials.js';
import { ApiClient } from './data/remote/api-client.js';
import { createReplicaServices, replicaFile } from './data/sync/index.js';
import { SojaError } from './domain/errors.js';
import type { GitClient } from './git/types.js';

export interface AppRuntime {
  services: AppServices;
  paths: SojaPaths;
  close(): void;
}

export interface BootstrapOptions {
  paths?: SojaPaths;
  config?: ConfigStore;
  credentials?: CredentialStore;
  clock?: () => Date;
  git?: GitClient;
  /** HTTP for remote mode (tests pass the server app's fetch). */
  fetch?: typeof fetch;
  /** Replica database for remote mode (tests use ':memory:'). */
  replicaFile?: string;
  /** Real-time connection for remote mode (tests pass a fake). */
  WebSocket?: typeof WebSocket;
}

/**
 * Composition root: the only place that knows the data source is local
 * SQLite. A remote mode would branch here and hand the same services a
 * different set of repositories.
 */
export async function bootstrap(options: BootstrapOptions = {}): Promise<AppRuntime> {
  const paths = options.paths ?? resolvePaths();
  const config = options.config ?? new FileConfigStore(paths.configFile);
  const gitConsole = new GitConsole();
  const git = options.git ?? new CliGit(gitConsole);

  const loaded = config.load();
  if (loaded?.mode === 'remote' && loaded.remote) {
    const credentials = options.credentials ?? new CredentialStore(paths.credentialsFile);
    const token = credentials.token(loaded.remote.apiUrl);
    if (!token) {
      throw new SojaError(`Not signed in to ${loaded.remote.apiUrl}.`, {
        hint: `Run \`soja login --server ${loaded.remote.apiUrl}\`, or \`soja mode local\` to work locally.`,
      });
    }
    const api = new ApiClient(loaded.remote.apiUrl, token, options.fetch);
    // The replica is plain SQLite with the local schema plus sync tables.
    const replica = openDatabase(options.replicaFile ?? replicaFile(paths.dataDir, loaded.remote.apiUrl), { foreignKeys: false });
    try {
      await runMigrations(replica);
    } catch (error) {
      replica.close();
      throw error;
    }
    const services = createReplicaServices(api, replica, config, git, gitConsole, options.WebSocket, paths.databaseFile);
    return {
      services,
      paths,
      close: () => {
        services.sync.stop();
        replica.close();
      },
    };
  }

  const handle = openDatabase(paths.databaseFile);
  try {
    await runMigrations(handle);
  } catch (error) {
    handle.close();
    throw error;
  }
  const repos = createLocalRepositories(handle, options.clock);
  const services = createServices(repos, config, {
    git,
    gitConsole,
    ...(options.clock ? { clock: options.clock } : {}),
  });
  return { services, paths, close: () => handle.close() };
}
