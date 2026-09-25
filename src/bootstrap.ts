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
import { BackupService } from './application/services/backup-service.js';
import { UpdateService } from './application/services/update-service.js';
import { NpmReleases } from './git/releases.js';
import { APP_VERSION } from './ui/branding/brand.js';
import { join } from 'node:path';
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
  /** Start private local services when a saved remote session is unavailable. */
  forceLocal?: boolean;
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
  if (loaded?.mode === 'remote' && loaded.remote && !options.forceLocal) {
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
    const services = createReplicaServices(api, replica, config, git, gitConsole, options.WebSocket, paths.databaseFile, new BackupService({ label: new URL(loaded.remote.apiUrl).host, backupTo: (file) => replica.backupTo(file) }, backupDir(paths)));
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
    backups: new BackupService({ label: 'local', backupTo: (file) => handle.backupTo(file) }, backupDir(paths), options.clock),
    git,
    gitConsole,
    ...(options.clock ? { clock: options.clock } : {}),
  });
  return { services, paths, close: () => handle.close() };
}

export function backupDir(paths: SojaPaths): string {
  return join(paths.dataDir, 'backups');
}

/**
 * The database the current mode uses, for restoring a backup without opening
 * it: the local one, or the replica of the configured server.
 */
export function activeDatabase(paths: SojaPaths = resolvePaths(), config: ConfigStore = new FileConfigStore(paths.configFile)): { file: string; label: string } {
  const loaded = config.load();
  if (loaded?.mode === 'remote' && loaded.remote) {
    return { file: replicaFile(paths.dataDir, loaded.remote.apiUrl), label: new URL(loaded.remote.apiUrl).host };
  }
  return { file: paths.databaseFile, label: 'local' };
}

/** Newer SOJA versions, from its GitHub releases (checked at most daily for notices). */
export function createUpdater(paths: SojaPaths = resolvePaths()): UpdateService {
  return new UpdateService(new NpmReleases(), APP_VERSION, join(paths.dataDir, 'update-check.json'));
}
