import { z } from 'zod';
import type { Repositories } from '../../data/repositories.js';
import type { Project } from '../../domain/entities.js';
import { ConflictError, NotFoundError } from '../../domain/errors.js';
import { deriveProjectKey, makeUnique } from '../../domain/naming.js';
import { activeCount, emptyStatusCounts } from '../../domain/task.js';
import { GitError, type GitClient } from '../../git/types.js';
import { resolveRepositoryRoot } from '../repository-root.js';
import type { ProjectSummary, Session } from '../types.js';
import { optionalText, parseInput } from '../validation.js';

const projectKeySchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z][A-Z0-9]{1,9}$/, { error: 'Keys are 2–10 letters or digits and start with a letter (e.g. ENROLL).' });

const createProjectSchema = z.object({
  name: z.string().trim().min(1, { error: 'Name the project.' }).max(60),
  key: projectKeySchema.optional(),
  description: optionalText(500),
  repositoryUrl: optionalText(500),
  repositoryPath: optionalText(500),
});

export type CreateProjectInput = z.input<typeof createProjectSchema>;

const updateProjectSchema = z.object({
  name: z.string().trim().min(1, { error: 'Name the project.' }).max(60).optional(),
  description: optionalText(500),
  repositoryUrl: optionalText(500),
});

/** What can change after creation. The key stays: people and scripts refer to it. */
export type ProjectChanges = z.input<typeof updateProjectSchema>;

export class ProjectService {
  constructor(
    private readonly repos: Repositories,
    private readonly git: GitClient,
  ) {}

  async list(session: Session): Promise<ProjectSummary[]> {
    const [projects, rows] = await Promise.all([
      this.repos.projects.listByWorkspace(session.workspace.id),
      this.repos.tasks.countByProjectAndStatus(session.workspace.id),
    ]);
    return projects.map((project) => {
      const counts = emptyStatusCounts();
      for (const row of rows) if (row.projectId === project.id) counts[row.status] += row.count;
      return { ...project, counts, active: activeCount(counts) };
    });
  }

  async create(session: Session, input: CreateProjectInput): Promise<Project> {
    const { name, key, ...rest } = parseInput(createProjectSchema, input);
    return this.repos.transaction(async () => {
      const existing = await this.repos.projects.listByWorkspace(session.workspace.id);
      if (existing.some((project) => project.name.toLowerCase() === name.toLowerCase())) {
        throw new ConflictError(`${name} already exists in ${session.workspace.name}.`);
      }
      const keys = new Set(existing.map((project) => project.key));
      if (key && keys.has(key)) throw new ConflictError(`The key ${key} is already used by another project.`);

      return this.repos.projects.create({
        workspaceId: session.workspace.id,
        name,
        key: key ?? makeUnique(deriveProjectKey(name), (candidate) => keys.has(candidate)),
        description: rest.description ?? null,
        repositoryUrl: rest.repositoryUrl ?? null,
        repositoryPath: rest.repositoryPath ?? null,
      });
    });
  }

  async update(session: Session, project: Project, changes: ProjectChanges): Promise<Project> {
    const data = parseInput(updateProjectSchema, changes);
    await this.get(session, project.id);
    if (data.name !== undefined) {
      const name = data.name;
      const others = (await this.repos.projects.listByWorkspace(session.workspace.id)).filter((other) => other.id !== project.id);
      if (others.some((other) => other.name.toLowerCase() === name.toLowerCase())) {
        throw new ConflictError(`${name} already exists in ${session.workspace.name}.`);
      }
    }
    const patch = Object.fromEntries(Object.entries(data).filter(([, value]) => value !== undefined));
    return Object.keys(patch).length ? this.repos.projects.update(project.id, patch) : project;
  }

  async get(session: Session, id: string): Promise<Project> {
    const project = await this.repos.projects.findById(id);
    if (!project || project.workspaceId !== session.workspace.id) {
      throw new NotFoundError('That project does not exist in this workspace.');
    }
    return project;
  }

  /**
   * Links a project to the local Git repository containing `path` (the
   * top-level directory is stored). Fills the repository URL from `origin`
   * when the project does not have one yet.
   */
  async linkRepository(session: Session, project: Project, path: string): Promise<Project> {
    const root = await resolveRepositoryRoot(this.git, path);
    await this.get(session, project.id);
    const repositoryUrl = project.repositoryUrl ?? (await this.git.originUrl(root));
    return this.repos.projects.update(project.id, { repositoryPath: root, repositoryUrl });
  }

  async unlinkRepository(session: Session, project: Project): Promise<Project> {
    await this.get(session, project.id);
    return this.repos.projects.update(project.id, { repositoryPath: null });
  }

  /** The project linked to the repository containing `path`, if any. Never throws for non-repositories. */
  async findByRepository(session: Session, path: string): Promise<Project | null> {
    let root: string | null;
    try {
      root = await this.git.repositoryRoot(path);
    } catch (error) {
      if (error instanceof GitError) return null;
      throw error;
    }
    if (!root) return null;
    const projects = await this.repos.projects.listByWorkspace(session.workspace.id);
    return projects.find((project) => project.repositoryPath === root) ?? null;
  }

  /** Finds a project by key (`ENROLL`) or name (`EnrollBridge`), case-insensitively. */
  async resolve(session: Session, keyOrName: string): Promise<Project> {
    const needle = keyOrName.trim().toLowerCase();
    const projects = await this.repos.projects.listByWorkspace(session.workspace.id);
    const project =
      projects.find((candidate) => candidate.key.toLowerCase() === needle) ??
      projects.find((candidate) => candidate.name.toLowerCase() === needle);
    if (!project) {
      throw new NotFoundError(`No project called “${keyOrName}” in ${session.workspace.name}.`, {
        hint: 'List them with `soja project list`.',
      });
    }
    return project;
  }
}
