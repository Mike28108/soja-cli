import { GitWorkflowService } from '../../application/services/git-workflow-service.js';
import { FolderService } from '../../application/services/folder-service.js';
import type { AppServices } from '../../application/services/index.js';
import type { ConfigStore } from '../../config/config.js';
import type { GitConsole } from '../../git/console.js';
import type { GitClient } from '../../git/types.js';
import type { ApiClient } from './api-client.js';
import { RemoteContext, RemoteProjectService, RemoteSessionService, RemoteTaskService, RemoteWorkspaceService } from './services.js';

/**
 * Services for remote mode: sessions, workspaces, projects and tasks go to the
 * SOJA server; Git, folders and the Git console stay on this machine.
 */
export function createRemoteServices(api: ApiClient, config: ConfigStore, git: GitClient, gitConsole: GitConsole): AppServices {
  const context = new RemoteContext(api, config);
  const projects = new RemoteProjectService(context, git);
  const tasks = new RemoteTaskService(context);
  return {
    session: new RemoteSessionService(context),
    workspaces: new RemoteWorkspaceService(context),
    projects,
    tasks,
    git: new GitWorkflowService(tasks, projects, git),
    folders: new FolderService(config),
    gitConsole,
    environment: { mode: 'remote', server: api.baseUrl },
  };
}
