import { randomUUID } from 'node:crypto';
import { asc, eq } from 'drizzle-orm';
import type { Database } from '../../database/client.js';
import { projectRepositories } from '../../database/schema.js';
import type { ProjectRepository as ProjectRepositoryEntity } from '../../domain/entities.js';
import { ConflictError, NotFoundError } from '../../domain/errors.js';
import type { ProjectRepositoryStore } from '../repositories.js';
import type { Clock } from './clock.js';
import { must } from './users.js';

export class LocalProjectRepositoryStore implements ProjectRepositoryStore {
  constructor(private readonly db: Database, private readonly clock: Clock) {}

  list(projectId: string): Promise<ProjectRepositoryEntity[]> {
    return this.db.select().from(projectRepositories).where(eq(projectRepositories.projectId, projectId)).orderBy(asc(projectRepositories.name));
  }

  async findById(id: string): Promise<ProjectRepositoryEntity | null> {
    return (await this.db.select().from(projectRepositories).where(eq(projectRepositories.id, id)).get()) ?? null;
  }

  async create(input: Parameters<ProjectRepositoryStore['create']>[0]): Promise<ProjectRepositoryEntity> {
    const now = this.clock();
    try {
      const [repo] = await this.db.insert(projectRepositories).values({
        id: input.id ?? randomUUID(), projectId: input.projectId, name: input.name,
        repositoryUrl: input.repositoryUrl ?? null, localPath: input.localPath ?? null,
        createdAt: now, updatedAt: now,
      }).returning();
      return must(repo);
    } catch (error) {
      if (String(error).includes('UNIQUE')) throw new ConflictError(`A repository named ${input.name} already exists in this project.`);
      throw error;
    }
  }

  async update(id: string, patch: Parameters<ProjectRepositoryStore['update']>[1]): Promise<ProjectRepositoryEntity> {
    try {
      const [repo] = await this.db.update(projectRepositories).set({ ...patch, updatedAt: this.clock() }).where(eq(projectRepositories.id, id)).returning();
      if (!repo) throw new NotFoundError('That repository does not exist.');
      return repo;
    } catch (error) {
      if (String(error).includes('UNIQUE')) throw new ConflictError(`A repository named ${patch.name} already exists in this project.`);
      throw error;
    }
  }

  async delete(id: string): Promise<void> {
    await this.db.delete(projectRepositories).where(eq(projectRepositories.id, id));
  }
}
