import { randomUUID } from 'node:crypto';
import { and, asc, eq } from 'drizzle-orm';
import type { Database } from '../../database/client.js';
import { projects } from '../../database/schema.js';
import type { Project } from '../../domain/entities.js';
import { NotFoundError } from '../../domain/errors.js';
import type { NewProject, ProjectPatch, ProjectRepository } from '../repositories.js';
import type { Clock } from './clock.js';
import { must } from './users.js';

export class LocalProjectRepository implements ProjectRepository {
  constructor(
    private readonly db: Database,
    private readonly clock: Clock,
  ) {}

  async findById(id: string): Promise<Project | null> {
    return (await this.db.select().from(projects).where(eq(projects.id, id)).get()) ?? null;
  }

  async findByKey(workspaceId: string, key: string): Promise<Project | null> {
    const row = await this.db
      .select()
      .from(projects)
      .where(and(eq(projects.workspaceId, workspaceId), eq(projects.key, key)))
      .get();
    return row ?? null;
  }

  async listByWorkspace(workspaceId: string): Promise<Project[]> {
    return this.db.select().from(projects).where(eq(projects.workspaceId, workspaceId)).orderBy(asc(projects.name));
  }

  async create(input: NewProject): Promise<Project> {
    const now = this.clock();
    const [project] = await this.db
      .insert(projects)
      .values({
        id: randomUUID(),
        description: null,
        repositoryUrl: null,
        repositoryPath: null,
        ...input,
        createdAt: now,
        updatedAt: now,
      })
      .returning();
    return must(project);
  }

  async update(id: string, patch: ProjectPatch): Promise<Project> {
    const [project] = await this.db
      .update(projects)
      .set({ ...patch, updatedAt: this.clock() })
      .where(eq(projects.id, id))
      .returning();
    if (!project) throw new NotFoundError('That project no longer exists.');
    return project;
  }
}
