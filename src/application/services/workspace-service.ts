import { z } from 'zod';
import type { ConfigStore } from '../../config/config.js';
import type { Repositories, WorkspaceWithRole } from '../../data/repositories.js';
import type { User, Workspace } from '../../domain/entities.js';
import { ConflictError, NotFoundError } from '../../domain/errors.js';
import { makeUnique, slugify } from '../../domain/naming.js';
import type { Member, Session } from '../types.js';
import { displayNameSchema, optionalText, parseInput, usernameSchema } from '../validation.js';

const createWorkspaceSchema = z.object({
  name: z.string().trim().min(1, { error: 'Name the workspace.' }).max(60),
  description: optionalText(500),
});

const addMemberSchema = z.object({
  username: usernameSchema,
  displayName: displayNameSchema.optional(),
});

export class WorkspaceService {
  constructor(
    private readonly repos: Repositories,
    private readonly config: ConfigStore,
  ) {}

  list(user: User): Promise<WorkspaceWithRole[]> {
    return this.repos.workspaces.listForUser(user.id);
  }

  async create(owner: User, input: z.input<typeof createWorkspaceSchema>): Promise<Workspace> {
    const { name, description } = parseInput(createWorkspaceSchema, input);
    return this.repos.transaction(async () => {
      const slug = await uniqueSlug(slugify(name) || 'workspace', (candidate) =>
        this.repos.workspaces.findBySlug(candidate),
      );
      const workspace = await this.repos.workspaces.create({ name, slug, description: description ?? null });
      await this.repos.workspaces.addMember({ workspaceId: workspace.id, userId: owner.id, role: 'owner' });
      return workspace;
    });
  }

  /** Makes a workspace active and remembers it in the config file. Accepts an id or a slug. */
  async switchTo(user: User, idOrSlug: string): Promise<Session> {
    const workspace =
      (await this.repos.workspaces.findById(idOrSlug)) ?? (await this.repos.workspaces.findBySlug(slugify(idOrSlug)));
    if (!workspace || !(await this.repos.workspaces.findMember(workspace.id, user.id))) {
      throw new NotFoundError(`You are not a member of a workspace called “${idOrSlug}”.`, {
        hint: 'List yours with `soja workspace list`.',
      });
    }
    // Keep machine settings (parent folders, remote server) when switching.
    const current = this.config.load();
    this.config.save({ parentFolders: [], ...current, mode: 'local', userId: user.id, workspaceId: workspace.id });
    return { user, workspace };
  }

  async members(session: Session): Promise<Member[]> {
    const members = await this.repos.workspaces.listMembers(session.workspace.id);
    return members.map(({ id, username, displayName, role, designated }) => ({ id, username, displayName, role, designated: role === 'owner' || Boolean(designated) }));
  }

  async findMember(session: Session, username: string): Promise<Member> {
    const normalized = username.trim().replace(/^@/, '').toLowerCase();
    const member = (await this.members(session)).find((candidate) => candidate.username === normalized);
    if (!member) {
      throw new NotFoundError(`@${normalized} is not a member of ${session.workspace.name}.`);
    }
    return member;
  }

  async setDesignated(session: Session, userId: string, designated: boolean): Promise<void> {
    await this.repos.workspaces.setDesignated(session.workspace.id, userId, designated);
  }

  /**
   * Adds a developer to the workspace. In local mode developers are plain
   * records (no login), so an unknown username creates one.
   */
  async addMember(session: Session, input: z.input<typeof addMemberSchema>): Promise<Member> {
    const { username, displayName } = parseInput(addMemberSchema, input);
    return this.repos.transaction(async () => {
      const user =
        (await this.repos.users.findByUsername(username)) ??
        (await this.repos.users.create({ username, displayName: displayName ?? username }));
      if (await this.repos.workspaces.findMember(session.workspace.id, user.id)) {
        throw new ConflictError(`@${username} is already in ${session.workspace.name}.`);
      }
      await this.repos.workspaces.addMember({ workspaceId: session.workspace.id, userId: user.id, role: 'member' });
      return { id: user.id, username: user.username, displayName: user.displayName, role: 'member' as const, designated: false };
    });
  }
}

async function uniqueSlug(base: string, find: (slug: string) => Promise<unknown>): Promise<string> {
  const taken = new Set<string>();
  for (let candidate = base; ; candidate = makeUnique(base, (value) => taken.has(value), '-')) {
    if (!(await find(candidate))) return candidate;
    taken.add(candidate);
  }
}
