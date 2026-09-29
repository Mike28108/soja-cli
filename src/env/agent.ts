import { chmodSync, existsSync, unlinkSync } from 'node:fs';
import { createConnection, createServer, type Server, type Socket } from 'node:net';
import { isAbsolute } from 'node:path';
import { z } from 'zod';
import { ENV_ENVIRONMENTS, type EnvEnvironment } from '../application/env.js';
import type { AppServices } from '../application/services/index.js';
import type { Session } from '../application/types.js';
import { SojaError } from '../domain/errors.js';
import { agentSocketPath, prepareSocketFolder } from './agent-socket.js';

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
  | { type: 'env'; project: { name: string; key: string }; environment: EnvEnvironment; variables: Record<string, string>; expiresAt: string | null }
  | { type: 'error'; message: string; hint?: string }
  | { type: 'stop'; reason: 'closed' | 'expired' | 'revoked' | 'workspace-changed' };

export interface AgentRun {
  id: number;
  project: string;
  environment: EnvEnvironment;
  command: string;
  expiresAt: Date | null;
  startedAt: Date;
}

/** Names a program must never receive from a shared vault (see soja-backend docs/ENV.md). */
const BLOCKED = /^(PATH|LD_PRELOAD|LD_LIBRARY_PATH|LD_AUDIT|NODE_OPTIONS|NODE_PATH|BASH_ENV|ENV|PROMPT_COMMAND|PYTHONSTARTUP|PYTHONPATH|PERL5OPT|PERL5LIB|RUBYOPT|RUBYLIB|JAVA_TOOL_OPTIONS|_JAVA_OPTIONS|GIT_SSH_COMMAND|GIT_EXEC_PATH|SHELL|HOME|IFS|DYLD_.*|SOJA_.*)$/;
const NAME = /^[A-Z_][A-Z0-9_]{0,127}$/;
const MAX_TIMER = 2 ** 31 - 1;

interface Connection {
  run: AgentRun;
  socket: Socket;
  vaultId: string;
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
      const { session, vaultId, loaded, project } = await this.resolve(request);
      for (const name of Object.keys(loaded.variables)) {
        if (!NAME.test(name) || BLOCKED.test(name)) throw new SojaError(`${name} is not allowed as a shared variable. SOJA did not start anything.`);
      }
      const id = (this.counter += 1);
      const run: AgentRun = { id, project: project.name, environment: loaded.environment, command: request.command.join(' '), expiresAt: loaded.expiresAt, startedAt: this.clock() };
      const connection: Connection = { run, socket, vaultId, workspaceId: session.workspace.id, timer: null };
      this.connections.set(id, connection);
      this.armExpiry(connection);
      this.watch();
      socket.on('close', () => this.forget(id));
      send(socket, { type: 'env', project: { name: project.name, key: project.key }, environment: loaded.environment, variables: loaded.variables, expiresAt: loaded.expiresAt?.toISOString() ?? null });
      this.emit();
    } catch (error) {
      this.fail(socket, error);
    }
  }

  private async resolve(request: z.infer<typeof helloSchema>) {
    const env = this.services.env;
    if (!env) throw new SojaError('Shared environment variables need remote mode.', { hint: 'Run `soja login`.' });
    const session: Session | null = await this.services.session.current();
    if (!session) throw new SojaError('SOJA is not set up yet.');
    const project = await this.services.projects.findByRepository(session, request.cwd);
    if (!project) throw new SojaError('This folder is not linked to a SOJA project.', { hint: 'Link its repository to the project first (`soja project link`, or `r` in Projects).' });
    const readable = (await env.vaults(session, project.id)).filter((vault) => vault.canRead);
    const vault = request.environment ? readable.find((candidate) => candidate.environment === request.environment) : readable.length === 1 ? readable[0] : undefined;
    if (!vault) {
      const available = readable.map((candidate) => candidate.environment).join(', ');
      if (request.environment) throw new SojaError(`You have no current access to ${project.name} ${request.environment} variables.`, { hint: available ? `You can use: ${available}.` : 'Ask a workspace owner to share them with you.' });
      throw new SojaError(readable.length ? `${project.name} has several environments you can use.` : `You have no access to ${project.name} variables.`, {
        hint: readable.length ? `Choose one: \`soja run -e <${available.replaceAll(', ', '|')}> -- …\`.` : 'Ask a workspace owner to share them with you.',
      });
    }
    return { session, vaultId: vault.id, loaded: await env.load(session, vault.id), project };
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
      const vault = vaults.find((candidate) => candidate.id === connection.vaultId);
      if (!vault?.canRead) this.stop(connection.run.id, 'revoked');
      else if (vault.expiresAt && (!connection.run.expiresAt || vault.expiresAt < connection.run.expiresAt)) {
        connection.run.expiresAt = vault.expiresAt;
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
