import type { ConfigStore } from '../../config/config.js';
import type { Repositories } from '../../data/repositories.js';
import { ProjectService } from './project-service.js';
import { SessionService } from './session-service.js';
import { TaskService } from './task-service.js';
import { WorkspaceService } from './workspace-service.js';

/** Everything the CLI and the TUI are allowed to call. Both get the same instance shape. */
export interface AppServices {
  session: SessionService;
  workspaces: WorkspaceService;
  projects: ProjectService;
  tasks: TaskService;
}

export function createServices(repos: Repositories, config: ConfigStore, clock?: () => Date): AppServices {
  const workspaces = new WorkspaceService(repos, config);
  return {
    session: new SessionService(repos, config, workspaces),
    workspaces,
    projects: new ProjectService(repos),
    tasks: new TaskService(repos, clock),
  };
}

export type { CreateProjectInput } from './project-service.js';
export type { SetupInput } from './session-service.js';
export type { CreateTaskInput, TaskChanges, TaskTarget } from './task-service.js';
