import { basename } from 'node:path';
import { GitWorkflowService } from '../../application/services/git-workflow-service.js';
import { FolderService } from '../../application/services/folder-service.js';
import { PreferenceService } from '../../application/services/preference-service.js';
import type { AppServices } from '../../application/services/index.js';
import { ProjectService } from '../../application/services/project-service.js';
import { TaskService } from '../../application/services/task-service.js';
import type { ConfigStore } from '../../config/config.js';
import type { DatabaseHandle } from '../../database/client.js';
import type { GitConsole } from '../../git/console.js';
import type { GitClient } from '../../git/types.js';
import { createLocalRepositories } from '../local/index.js';
import type { ApiClient } from '../remote/api-client.js';
import { LiveConnection } from '../remote/live.js';
import { ReplicaChatService } from './chat.js';
import { LocalImporter } from './importer.js';
import type { BackupOperations } from '../../application/ports.js';
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
  /**
   * Opens the real-time connection for a workspace (the TUI does; one-shot
   * commands do not need it). Returns a function that closes it.
   */
  startLive(workspaceId: string): () => void;
  /** Cancels scheduled syncs and live connections (the runtime is closing). */
  stop(): void;
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
  WebSocketImpl: typeof WebSocket | undefined,
  localDatabaseFile: string | undefined,
  backups: BackupOperations,
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

  // The server paced us (message rate limit): try the rest when its window has passed.
  engine.subscribe((report) => {
    const workspaceId = config.load()?.remote?.workspaceId;
    if (report?.deferred && workspaceId) scheduleSync(workspaceId, 10_000);
  });

  const connections = new Set<LiveConnection>();
  const startLive = (workspaceId: string) => {
    if (!api.token) return () => undefined;
    const live = new LiveConnection({
      apiUrl: api.baseUrl,
      token: api.token,
      workspaceId,
      ...(WebSocketImpl ? { WebSocket: WebSocketImpl } : {}),
      onReady: () => void engine.sync(workspaceId),
      onEvent: (event) => {
        void engine.receive(workspaceId, event).then(
          (needsSync) => {
            if (needsSync) scheduleSync(workspaceId, 150);
          },
          () => scheduleSync(workspaceId, 150),
        );
      },
    });
    connections.add(live);
    live.start();
    return () => {
      connections.delete(live);
      live.stop();
    };
  };
  return {
    session: new ReplicaSessionService(context),
    workspaces: new ReplicaWorkspaceService(context),
    projects,
    tasks,
    chat: new ReplicaChatService(context, tasks),
    ...(localDatabaseFile ? { importer: new LocalImporter(localDatabaseFile, config, api, store, engine) } : {}),
    git: new GitWorkflowService(tasks, projects, git),
    folders: new FolderService(config),
    preferences: new PreferenceService(config),
    gitConsole,
    environment: { mode: 'remote', server: api.baseUrl },
    backups,
    sync: {
      status: (workspaceId) => engine.status(workspaceId),
      syncNow: (workspaceId) => engine.sync(workspaceId),
      scheduleSync,
      subscribe: (listener) => engine.subscribe(listener),
      notices: (workspaceId, taskId) => store.notices(workspaceId, taskId),
      dismissNotice: (id) => store.dismissNotice(id),
      startLive,
      stop: () => {
        if (timer) clearTimeout(timer);
        timer = null;
        for (const live of connections) live.stop();
        connections.clear();
      },
    },
  };
}
