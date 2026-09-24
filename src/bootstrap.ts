import { FileConfigStore, type ConfigStore } from './config/config.js';
import { resolvePaths, type SojaPaths } from './config/paths.js';
import { createServices, type AppServices } from './application/services/index.js';
import { createLocalRepositories } from './data/local/index.js';
import { openDatabase } from './database/client.js';
import { runMigrations } from './database/migrate.js';

export interface AppRuntime {
  services: AppServices;
  paths: SojaPaths;
  close(): void;
}

export interface BootstrapOptions {
  paths?: SojaPaths;
  config?: ConfigStore;
  clock?: () => Date;
}

/**
 * Composition root: the only place that knows the data source is local
 * SQLite. A remote mode would branch here and hand the same services a
 * different set of repositories.
 */
export async function bootstrap(options: BootstrapOptions = {}): Promise<AppRuntime> {
  const paths = options.paths ?? resolvePaths();
  const config = options.config ?? new FileConfigStore(paths.configFile);
  const handle = openDatabase(paths.databaseFile);
  try {
    await runMigrations(handle);
  } catch (error) {
    handle.close();
    throw error;
  }
  const repos = createLocalRepositories(handle, options.clock);
  return { services: createServices(repos, config, options.clock), paths, close: () => handle.close() };
}
