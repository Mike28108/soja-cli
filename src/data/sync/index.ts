import { basename } from 'node:path';
import { GitWorkflowService } from '../../application/services/git-workflow-service.js';
import { FolderService } from '../../application/services/folder-service.js';
import type { AppServices } from '../../application/services/index.js';
import { ProjectService } from '../../application/services/project-service.js';
import { TaskService } from '../../application/services/task-service.js';
import type { ConfigStore } from '../../config/config.js';
import type { DatabaseHandle } from '../../database/client.js';
import type { GitConsole } from '../../git/console.js';
import type { GitClient } from '../../git/types.js';
import { createLocalRepositories } from '../local/index.js';
import type { ApiClient } from '../remote/api-client.js';
import { SyncEngine, type SyncReport, type SyncStatus } from './engine.js';
import { ReplicaProjectService, ReplicaSessionService, ReplicaTaskService, ReplicaWorkspaceService, type ReplicaContext } from './services.js';
import { ReplicaStore, type Notice } from './store.js';

/** What the interface and commands can ask about synchronization (remote mode only). */
export interface SyncControl {
  status(workspaceId: string): Promise<SyncStatus>;
  /** One sync cycle now; never throws. */
  syncNow(workspaceId: string): Promise<SyncReport>;
  /** Sync shortly after changes, batching bursts of edits. */
  scheduleSync(workspaceId: string, delayMs?: number): void;
  /** Called with null when a sync starts and with its report when it ends, whoever started it. */
  subscribe(listener: (report: SyncReport | null) => void): () => void;
  notices(workspaceId: string, taskId?: string): Promise<Notice[]>;
  dismissNotice(id: string): Promise<void>;
}

/** Replica file per server: `~/.local/share/soja/remote/<host>.db`. */
export function replicaFile(dataDir: string, apiUrl: string): string {
  const host = new URL(apiUrl).host.replace(/[^a-z0-9.-]/gi, '_');
  return `${dataDir}/remote/${basename(host)}.db`;
}

export function createReplicaServices(
  api: ApiClient,
  handle: DatabaseHandle,
  config: ConfigStore,
  git: GitClient,
  gitConsole: GitConsole,
): AppServices & { sync: SyncControl } {
  const repos = createLocalRepositories(handle);
  const store = new ReplicaStore(handle.db);
  const engine = new SyncEngine(api, store);

  let timer: NodeJS.Timeout | null = null;
  let workspaceForTimer: string | null = null;
  const scheduleSync = (workspaceId: string, delayMs = 800) => {
    workspaceForTimer = workspaceId;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      if (workspaceForTimer) void engine.sync(workspaceForTimer);
    }, delayMs);
    timer.unref(); // never keep a finished CLI command alive
  };

  const context: ReplicaContext = {
    api,
    store,
    engine,
    repos,
    config,
    onWrite: () => {
      const workspaceId = config.load()?.remote?.workspaceId;
      if (workspaceId) scheduleSync(workspaceId);
    },
  };

  const projects = new ReplicaProjectService(context, new ProjectService(repos, git));
  const tasks = new ReplicaTaskService(context, new TaskService(repos));
  return {
    session: new ReplicaSessionService(context),
    workspaces: new ReplicaWorkspaceService(context),
    projects,
    tasks,
    git: new GitWorkflowService(tasks, projects, git),
    folders: new FolderService(config),
    gitConsole,
    environment: { mode: 'remote', server: api.baseUrl },
    sync: {
      status: (workspaceId) => engine.status(workspaceId),
      syncNow: (workspaceId) => engine.sync(workspaceId),
      scheduleSync,
      subscribe: (listener) => engine.subscribe(listener),
      notices: (workspaceId, taskId) => store.notices(workspaceId, taskId),
      dismissNotice: (id) => store.dismissNotice(id),
    },
  };
}
