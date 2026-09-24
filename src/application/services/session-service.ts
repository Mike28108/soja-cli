import { z } from 'zod';
import type { ConfigStore } from '../../config/config.js';
import type { Repositories } from '../../data/repositories.js';
import type { Session } from '../types.js';
import { displayNameSchema, parseInput, usernameSchema } from '../validation.js';
import type { WorkspaceService } from './workspace-service.js';

const setupSchema = z.object({
  displayName: displayNameSchema,
  username: usernameSchema,
  workspaceName: z.string().trim().min(1, { error: 'Name the workspace.' }).max(60),
});

export type SetupInput = z.input<typeof setupSchema>;

export class SessionService {
  constructor(
    private readonly repos: Repositories,
    private readonly config: ConfigStore,
    private readonly workspaces: WorkspaceService,
  ) {}

  /** The configured user and workspace, or null when setup is needed. */
  async current(): Promise<Session | null> {
    const config = this.config.load();
    if (!config) return null;

    const [user, workspace] = await Promise.all([
      this.repos.users.findById(config.userId),
      this.repos.workspaces.findById(config.workspaceId),
    ]);
    if (!user) return null;
    if (workspace && (await this.repos.workspaces.findMember(workspace.id, user.id))) {
      return { user, workspace };
    }

    // The active workspace vanished (db reset, left it): fall back to any other.
    const [fallback] = await this.repos.workspaces.listForUser(user.id);
    return fallback ? this.workspaces.switchTo(user, fallback.id) : null;
  }

  /**
   * First run: creates the local user and first workspace, then persists
   * them as the active session. Re-running setup against an existing
   * database reuses a matching username instead of failing.
   */
  async setup(input: SetupInput): Promise<Session> {
    const { displayName, username, workspaceName } = parseInput(setupSchema, input);

    const user =
      (await this.repos.users.findByUsername(username)) ?? (await this.repos.users.create({ username, displayName }));

    const existing = (await this.repos.workspaces.listForUser(user.id)).find(
      (workspace) => workspace.name.toLowerCase() === workspaceName.toLowerCase(),
    );
    const workspace = existing ?? (await this.workspaces.create(user, { name: workspaceName }));
    return this.workspaces.switchTo(user, workspace.id);
  }
}
