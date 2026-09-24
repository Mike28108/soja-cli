import { randomUUID } from 'node:crypto';
import { and, asc, eq } from 'drizzle-orm';
import type { Database } from '../../database/client.js';
import { users, workspaceMembers, workspaces } from '../../database/schema.js';
import type { Workspace, WorkspaceMember } from '../../domain/entities.js';
import type { MemberWithUser, WorkspaceRepository, WorkspaceWithRole } from '../repositories.js';
import type { Clock } from './clock.js';
import { must } from './users.js';

export class LocalWorkspaceRepository implements WorkspaceRepository {
  constructor(
    private readonly db: Database,
    private readonly clock: Clock,
  ) {}

  async findById(id: string): Promise<Workspace | null> {
    return (await this.db.select().from(workspaces).where(eq(workspaces.id, id)).get()) ?? null;
  }

  async findBySlug(slug: string): Promise<Workspace | null> {
    return (await this.db.select().from(workspaces).where(eq(workspaces.slug, slug)).get()) ?? null;
  }

  async create(input: { name: string; slug: string; description?: string | null }): Promise<Workspace> {
    const now = this.clock();
    const [workspace] = await this.db
      .insert(workspaces)
      .values({ id: randomUUID(), description: null, ...input, createdAt: now, updatedAt: now })
      .returning();
    return must(workspace);
  }

  async listForUser(userId: string): Promise<WorkspaceWithRole[]> {
    const rows = await this.db
      .select({ workspace: workspaces, role: workspaceMembers.role })
      .from(workspaceMembers)
      .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
      .where(eq(workspaceMembers.userId, userId))
      .orderBy(asc(workspaces.name));
    return rows.map((row) => ({ ...row.workspace, role: row.role }));
  }

  async addMember(member: WorkspaceMember): Promise<void> {
    await this.db.insert(workspaceMembers).values(member);
  }

  async findMember(workspaceId: string, userId: string): Promise<WorkspaceMember | null> {
    const row = await this.db
      .select()
      .from(workspaceMembers)
      .where(and(eq(workspaceMembers.workspaceId, workspaceId), eq(workspaceMembers.userId, userId)))
      .get();
    return row ?? null;
  }

  async listMembers(workspaceId: string): Promise<MemberWithUser[]> {
    const rows = await this.db
      .select({ user: users, role: workspaceMembers.role })
      .from(workspaceMembers)
      .innerJoin(users, eq(users.id, workspaceMembers.userId))
      .where(eq(workspaceMembers.workspaceId, workspaceId))
      .orderBy(asc(users.username));
    return rows.map((row) => ({ ...row.user, role: row.role }));
  }
}
