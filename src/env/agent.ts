import { chmodSync, existsSync, unlinkSync } from 'node:fs';
import { createConnection, createServer, type Server, type Socket } from 'node:net';
import { isAbsolute } from 'node:path';
import { z } from 'zod';
import { ENV_ENVIRONMENTS, type EnvEnvironment } from '../application/env.js';
import type { AppServices } from '../application/services/index.js';
import type { Session } from '../application/types.js';
import { SojaError } from '../domain/errors.js';
import { agentSocketPath, prepareSocketFolder } from './agent-socket.js';
import { isAllowedVariable } from './names.js';

/*
 * The agent lives inside the open SOJA. `soja run` asks it for the variables of
 * the project linked to its folder; it decrypts them in memory, hands them over
 * and keeps the connection open. Closing SOJA, an expired or revoked access, or
 * a workspace switch closes every connection, and `soja run` stops its process.
 */

export const AGENT_PROTOCOL = 1;

const helloSchema = z.object({
  type: z.literal('hello'),
  version: z.literal(AGENT_PROTOCOL),
  cwd: z.string().refine(isAbsolute),
  environment: z.enum(ENV_ENVIRONMENTS as [EnvEnvironment, ...EnvEnvironment[]]).optional(),
  command: z.array(z.string().max(1000)).max(50),
}).strict();

export type AgentReply =
  | { type: 'env'; project: { name: string; key: string }; repository?: string | null; environment: EnvEnvironment; variables: Record<string, string>; expiresAt: string | null }
  | { type: 'error'; message: string; hint?: string }
  | { type: 'stop'; reason: 'closed' | 'expired' | 'revoked' | 'workspace-changed' };

export interface AgentRun {
  id: number;
  project: string;
  repository: string | null;
  environment: EnvEnvironment;
  command: string;
  expiresAt: Date | null;
  startedAt: Date;
}

const MAX_TIMER = 2 ** 31 - 1;

interface Connection {
  run: AgentRun;
  socket: Socket;
  /** The whole-project vault and the repository's, whichever apply. */
  vaultIds: string[];
  workspaceId: string;
  timer: NodeJS.Timeout | null;
}

export class EnvAgent {
  private server: Server | null = null;
  private connections = new Map<number, Connection>();
  private counter = 0;
  private watcher: NodeJS.Timeout | null = null;
  private listeners = new Set<(runs: AgentRun[]) => void>();

  constructor(
    private readonly services: AppServices,
    private readonly socketPath: string = agentSocketPath(),
    private readonly clock: () => Date = () => new Date(),
    /** How often access is re-checked while something runs. */
    private readonly checkEveryMs = 60_000,
  ) {}

  /** Starts listening. `already-running` when another open SOJA already serves this user. */
  async start(): Promise<'started' | 'already-running'> {
    prepareSocketFolder(this.socketPath);
    if (existsSync(this.socketPath)) {
      if (await answers(this.socketPath)) return 'already-running';
      unlinkSync(this.socketPath);
    }
    const server = createServer((socket) => this.accept(socket));
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(this.socketPath, () => resolve());
    });
    // Only this user may connect: the folder is 0700 and the socket itself 0600.
    if (process.platform !== 'win32') chmodSync(this.socketPath, 0o600);
    this.server = server;
    return 'started';
  }

  runs(): AgentRun[] {
    return [...this.connections.values()].map((connection) => connection.run);
  }

  subscribe(listener: (runs: AgentRun[]) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Stops every run started through this agent and stops listening. */
  close(reason: 'closed' | 'workspace-changed' = 'closed'): void {
    for (const id of [...this.connections.keys()]) this.stop(id, reason);
    if (reason === 'closed') {
      if (this.watcher) clearInterval(this.watcher);
      this.watcher = null;
      this.server?.close();
      this.server = null;
      if (process.platform !== 'win32' && existsSync(this.socketPath)) unlinkSync(this.socketPath);
    }
  }

  private accept(socket: Socket): void {
    let buffer = '';
    let answered = false;
    socket.setEncoding('utf8');
    socket.on('data', (chunk: string) => {
      if (answered) return;
      buffer += chunk;
      if (buffer.length > 64 * 1024) return this.fail(socket, new SojaError('Request too large.'));
      const newline = buffer.indexOf('\n');
      if (newline < 0) return;
      answered = true;
      void this.hello(socket, buffer.slice(0, newline));
    });
    socket.on('error', () => undefined);
  }

  private async hello(socket: Socket, line: string): Promise<void> {
    let request: z.infer<typeof helloSchema>;
    try {
      request = helloSchema.parse(JSON.parse(line));
    } catch {
      return this.fail(socket, new SojaError('This `soja run` does not match the open SOJA.', { hint: 'Update SOJA (`soja update`) so both are the same version.' }));
    }
    try {
      const { session, vaultIds, environment, variables, expiresAt, project, repository } = await this.resolve(request);
      for (const name of Object.keys(variables)) {
        if (!isAllowedVariable(name)) throw new SojaError(`${name} is not allowed as a shared variable. SOJA did not start anything.`);
      }
      const id = (this.counter += 1);
      const run: AgentRun = { id, project: project.name, repository: repository?.name ?? null, environment, command: request.command.join(' '), expiresAt, startedAt: this.clock() };
      const connection: Connection = { run, socket, vaultIds, workspaceId: session.workspace.id, timer: null };
      this.connections.set(id, connection);
      this.armExpiry(connection);
      this.watch();
      socket.on('close', () => this.forget(id));
      send(socket, { type: 'env', project: { name: project.name, key: project.key }, repository: repository?.name ?? null, environment, variables, expiresAt: expiresAt?.toISOString() ?? null });
      this.emit();
    } catch (error) {
      this.fail(socket, error);
    }
  }

  /**
   * The variables for this folder: the project's shared ones, then the ones of
   * the repository it is (a name in both takes the repository's value).
   */
  private async resolve(request: z.infer<typeof helloSchema>) {
    const env = this.services.env;
    if (!env) throw new SojaError('Shared environment variables need remote mode.', { hint: 'Run `soja login`.' });
    const session: Session | null = await this.services.session.current();
    if (!session) throw new SojaError('SOJA is not set up yet.');
    const here = await this.services.projects.locate(session, request.cwd);
    if (!here) throw new SojaError('This folder is not linked to a SOJA project.', { hint: 'Link its repository to the project first (`soja project link`, or `r` in Projects).' });
    const { project, repository } = here;
    const scopes = new Set<string | null>([null, repository?.id ?? null]);
    const readable = (await env.vaults(session, project.id)).filter((vault) => vault.canRead && scopes.has(vault.repositoryId));
    const environments = [...new Set(readable.map((vault) => vault.environment))];
    const where = repository && repository.name !== 'default' ? `${project.name}/${repository.name}` : project.name;
    const environment = request.environment ?? (environments.length === 1 ? environments[0] : undefined);
    const chosen = readable.filter((vault) => vault.environment === environment);
    if (!environment || !chosen.length) {
      const available = environments.join(', ');
      if (request.environment) throw new SojaError(`You have no current access to ${where} ${request.environment} variables.`, { hint: available ? `You can use: ${available}.` : 'Ask a workspace owner to share them with you.' });
      throw new SojaError(environments.length ? `${where} has several environments you can use.` : `You have no access to ${where} variables.`, {
        hint: environments.length ? `Choose one: \`soja run -e <${available.replaceAll(', ', '|')}> -- …\`.` : 'Ask a workspace owner to share them with you.',
      });
    }
    // Whole project first, then the repository on top. Each ref is what this machine asked for,
    // not what the list claims: the loaded material must match it.
    const ordered = [...chosen].sort((a, b) => (a.repositoryId === null ? -1 : 1) - (b.repositoryId === null ? -1 : 1));
    const loaded = [];
    for (const vault of ordered) loaded.push(await env.load(session, { id: vault.id, projectId: project.id, repositoryId: vault.repositoryId === null ? null : (repository?.id ?? null), environment }));
    const variables = Object.assign({}, ...loaded.map((entry) => entry.variables)) as Record<string, string>;
    const ends = loaded.flatMap((entry) => (entry.expiresAt ? [entry.expiresAt.getTime()] : []));
    return { session, vaultIds: ordered.map((vault) => vault.id), environment, variables, expiresAt: ends.length ? new Date(Math.min(...ends)) : null, project, repository };
  }

  /** Stops the run when its access ends, even if nobody asks the server. */
  private armExpiry(connection: Connection): void {
    if (!connection.run.expiresAt) return;
    const wait = connection.run.expiresAt.getTime() - this.clock().getTime();
    connection.timer = setTimeout(() => {
      if (connection.run.expiresAt && connection.run.expiresAt.getTime() <= this.clock().getTime()) this.stop(connection.run.id, 'expired');
      else this.armExpiry(connection);
    }, Math.max(0, Math.min(wait, MAX_TIMER)));
  }

  /** While something runs, ask the server now and then whether access still stands (revocations). */
  private watch(): void {
    if (this.watcher) return;
    this.watcher = setInterval(() => void this.recheck(), this.checkEveryMs);
    this.watcher.unref();
  }

  async recheck(): Promise<void> {
    if (!this.connections.size) return;
    const env = this.services.env;
    const session = await this.services.session.current().catch(() => null);
    if (!env || !session) return;
    for (const connection of [...this.connections.values()]) {
      if (connection.workspaceId !== session.workspace.id) {
        this.stop(connection.run.id, 'workspace-changed');
        continue;
      }
      const vaults = await env.vaults(session).catch(() => null);
      if (!vaults) continue; // Offline: the expiry timer still applies.
      const used = connection.vaultIds.map((id) => vaults.find((candidate) => candidate.id === id));
      if (used.some((vault) => !vault?.canRead)) {
        this.stop(connection.run.id, 'revoked');
        continue;
      }
      const ends = used.flatMap((vault) => (vault?.expiresAt ? [vault.expiresAt] : []));
      const earliest = ends.length ? new Date(Math.min(...ends.map((end) => end.getTime()))) : null;
      if (earliest && (!connection.run.expiresAt || earliest < connection.run.expiresAt)) {
        connection.run.expiresAt = earliest;
        if (connection.timer) clearTimeout(connection.timer);
        this.armExpiry(connection);
      }
    }
  }

  private stop(id: number, reason: 'closed' | 'expired' | 'revoked' | 'workspace-changed'): void {
    const connection = this.connections.get(id);
    if (!connection) return;
    send(connection.socket, { type: 'stop', reason });
    connection.socket.end();
    this.forget(id);
  }

  private forget(id: number): void {
    const connection = this.connections.get(id);
    if (!connection) return;
    if (connection.timer) clearTimeout(connection.timer);
    this.connections.delete(id);
    if (!this.connections.size && this.watcher) {
      clearInterval(this.watcher);
      this.watcher = null;
    }
    this.emit();
  }

  private fail(socket: Socket, error: unknown): void {
    const message = error instanceof SojaError ? error.message : 'SOJA could not load the variables.';
    const hint = error instanceof SojaError ? error.hint : undefined;
    send(socket, { type: 'error', message, ...(hint ? { hint } : {}) });
    socket.end();
  }

  private emit(): void {
    const runs = this.runs();
    for (const listener of this.listeners) listener(runs);
  }
}

function send(socket: Socket, reply: AgentReply): void {
  if (!socket.destroyed) socket.write(`${JSON.stringify(reply)}\n`);
}

/** Whether something is listening there (another open SOJA). */
function answers(path: string): Promise<boolean> {
  return new Promise((resolve) => {
    const probe = createConnection(path);
    probe.once('connect', () => {
      probe.destroy();
      resolve(true);
    });
    probe.once('error', () => resolve(false));
  });
}
