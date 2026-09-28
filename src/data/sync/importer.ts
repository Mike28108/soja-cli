import { createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import type { ImportOperations, ImportOutcome, ImportPreview } from '../../application/import.js';
import type { Session } from '../../application/types.js';
import type { ConfigStore } from '../../config/config.js';
import { openDatabase } from '../../database/client.js';
import { runMigrations } from '../../database/migrate.js';
import type { Workspace } from '../../domain/entities.js';
import { NotFoundError, SojaError } from '../../domain/errors.js';
import { OfflineError, type ApiClient } from '../remote/api-client.js';
import { createLocalRepositories } from '../local/index.js';
import type { Repositories } from '../repositories.js';
import type { SyncEngine } from './engine.js';
import type { ReplicaStore } from './store.js';

interface ServerResult {
  projects: number;
  tasks: number;
  comments: number;
  activity: number;
  renumbered: Record<string, number>;
  projectIds: Record<string, string>;
  repositoryIds: Record<string, string>;
  unmatchedUsers: string[];
}

/**
 * Reads the local-mode database (`soja.db`) and sends its history to the
 * SOJA server in one request (`POST /import`, soja-backend ≥ 1.0). The local
 * database is only read, never changed.
 */
export class LocalImporter implements ImportOperations {
  constructor(
    private readonly localFile: string,
    private readonly config: ConfigStore,
    private readonly api: ApiClient,
    private readonly store: ReplicaStore,
    private readonly engine: SyncEngine,
  ) {}

  async preview(session: Session, options: { from?: string } = {}): Promise<ImportPreview> {
    return this.withLocal(async (repos) => {
      const data = await this.collect(repos, options.from);
      return {
        from: { name: data.workspace.name, slug: data.workspace.slug },
        projects: data.projects.length,
        tasks: data.tasks.length,
        comments: data.comments.length,
        activity: data.activity.length,
        developers: data.users.map((user) => user.username),
        alreadyImported: await this.alreadyImported(session, data.workspace),
      };
    });
  }

  async run(session: Session, options: { from?: string } = {}): Promise<ImportOutcome> {
    return this.withLocal(async (repos) => {
      const data = await this.collect(repos, options.from);
      let result: ServerResult;
      try {
        result = await this.api.post<ServerResult>(`/v1/workspaces/${session.workspace.id}/import`, {
          importId: importId(data.workspace.id, session.workspace.id),
          users: data.users.map((user) => ({ localId: user.id, username: user.username })),
          projects: data.projects.map(({ id, name, key, description, repositoryUrl, createdAt, updatedAt, repositories }) => ({
            localId: id, name, key, description, repositoryUrl, createdAt, updatedAt,
            repositories: repositories.map(({ id: localId, name, repositoryUrl }) => ({ localId, name, repositoryUrl })),
          })),
          tasks: data.tasks.map((task) => ({
            localId: task.id, number: task.number, projectLocalId: task.projectId, repositoryLocalId: task.repositoryId, title: task.title, description: task.description,
            type: task.type, priority: task.priority, status: task.status, assigneeLocalId: task.assigneeId, creatorLocalId: task.creatorId,
            requester: task.requester, branch: task.branch, baseBranch: task.baseBranch, branchStart: task.branchStart,
            createdAt: task.createdAt, updatedAt: task.updatedAt, startedAt: task.startedAt, completedAt: task.completedAt, archivedAt: task.archivedAt,
          })),
          comments: data.comments.map((comment) => ({
            taskLocalId: comment.taskId, userLocalId: comment.userId, body: comment.body, createdAt: comment.createdAt, updatedAt: comment.updatedAt,
          })),
          activity: data.activity.map((item) => ({
            taskLocalId: item.taskId, userLocalId: item.userId, type: item.type, metadata: item.metadata, createdAt: item.createdAt,
          })),
        });
      } catch (error) {
        if (error instanceof OfflineError) {
          throw new SojaError('Importing needs a connection to the SOJA server.', { hint: 'Nothing was sent; try again when you are online.', cause: error });
        }
        throw error;
      }
      const id = importId(data.workspace.id, session.workspace.id);
      const current = this.config.load();
      if (current?.remote) {
        const imports = [...new Set([...(current.remote.imports ?? []), id])];
        this.config.save({ ...current, remote: { ...current.remote, imports } });
      }
      await this.engine.sync(session.workspace.id);
      // Folder links are per machine: carry this machine's over to the imported projects.
      let linkedFolders = 0;
      for (const project of data.projects) {
        const serverId = result.projectIds[project.id];
        if (!serverId || !project.repositoryPath) continue;
        await this.store.setRepositoryPath(serverId, project.repositoryPath);
        linkedFolders += 1;
      }
      for (const project of data.projects) {
        for (const repository of project.repositories) {
          const repositoryId = result.repositoryIds?.[repository.id];
          if (!repositoryId || !repository.localPath) continue;
          await this.store.setProjectRepositoryPath(repositoryId, repository.localPath);
          linkedFolders += 1;
        }
      }
      return {
        projects: result.projects,
        tasks: result.tasks,
        comments: result.comments,
        activity: result.activity,
        renumbered: result.renumbered,
        unmatchedUsers: result.unmatchedUsers,
        linkedFolders,
      };
    });
  }

  private async collect(repos: Repositories, from: string | undefined) {
    const workspace = await this.localWorkspace(repos, from);
    const [members, projects, tasks] = await Promise.all([
      repos.workspaces.listMembers(workspace.id),
      repos.projects.listByWorkspace(workspace.id),
      repos.tasks.list({ workspaceId: workspace.id, archived: 'include' }),
    ]);
    const projectsWithRepositories = await Promise.all(projects.map(async (project) => ({ ...project, repositories: await repos.projectRepositories.list(project.id) })));
    const comments = (await Promise.all(tasks.map((task) => repos.comments.listByTask(task.id)))).flat();
    const activity = (await Promise.all(tasks.map((task) => repos.activity.listByTask(task.id)))).flat();
    // Creators or commenters who left the workspace still need a username to be matched.
    const known = new Set(members.map((member) => member.id));
    const others = new Set<string>();
    for (const task of tasks) for (const id of [task.creatorId, task.assigneeId]) if (id && !known.has(id)) others.add(id);
    for (const comment of comments) if (!known.has(comment.userId)) others.add(comment.userId);
    const users = [...members, ...(await repos.users.findByIds([...others]))];
    return { workspace, users, projects: projectsWithRepositories, tasks: tasks.filter((task) => task.number > 0), comments, activity };
  }

  private async localWorkspace(repos: Repositories, from: string | undefined): Promise<Workspace> {
    const config = this.config.load();
    const workspace = from
      ? ((await repos.workspaces.findBySlug(from)) ?? (await repos.workspaces.findById(from)))
      : config?.workspaceId
        ? await repos.workspaces.findById(config.workspaceId)
        : null;
    if (!workspace) {
      throw new NotFoundError(from ? `There is no local workspace “${from}”.` : 'No local workspace to import.', {
        hint: 'Name it with --from <slug>; `soja mode local` then `soja workspace list` shows them.',
      });
    }
    return workspace;
  }

  private async alreadyImported(session: Session, workspace: Workspace): Promise<boolean> {
    // The server would answer a repeat with the first result anyway; this is only to warn before.
    return (this.config.load()?.remote?.imports ?? []).includes(importId(workspace.id, session.workspace.id));
  }

  private async withLocal<T>(work: (repos: Repositories) => Promise<T>): Promise<T> {
    if (!existsSync(this.localFile)) {
      throw new NotFoundError('There is no local SOJA data on this machine.', { hint: 'Nothing to import: local mode was never used here.' });
    }
    const handle = openDatabase(this.localFile);
    try {
      await runMigrations(handle);
      return await work(createLocalRepositories(handle));
    } finally {
      handle.close();
    }
  }
}

/** The same local workspace imported into the same server workspace always has the same id, so it never duplicates. */
function importId(localWorkspaceId: string, serverWorkspaceId: string): string {
  const hex = createHash('sha256').update(`soja-import:${localWorkspaceId}:${serverWorkspaceId}`).digest('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
