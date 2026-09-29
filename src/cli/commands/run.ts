import { spawn } from 'node:child_process';
import { createConnection, type Socket } from 'node:net';
import { ENV_ENVIRONMENTS, type EnvEnvironment } from '../../application/env.js';
import { SojaError, ValidationError } from '../../domain/errors.js';
import { AGENT_PROTOCOL, type AgentReply } from '../../env/agent.js';
import { agentSocketPath } from '../../env/agent-socket.js';
import { stopTree } from '../../env/process-tree.js';
import { oneOf } from './args.js';
import { paint } from '../output.js';

const STOP_REASONS: Record<Extract<AgentReply, { type: 'stop' }>['reason'], string> = {
  closed: 'SOJA was closed',
  expired: 'your access to these variables expired',
  revoked: 'your access to these variables was revoked',
  'workspace-changed': 'SOJA switched to another workspace',
};

/**
 * `soja run [-e <environment>] -- <command…>`: runs a command with the shared
 * variables of the project linked to this folder. The open SOJA hands them over
 * in memory; nothing is written to disk. When SOJA closes or access ends, the
 * command (and everything it started) is stopped.
 */
export async function runCommand(args: string[]): Promise<void> {
  const { environment, command } = parseRun(args);
  const socket = await connect(agentSocketPath());
  const replies = lines(socket);
  socket.write(`${JSON.stringify({ type: 'hello', version: AGENT_PROTOCOL, cwd: process.cwd(), ...(environment ? { environment } : {}), command })}\n`);
  const first = await replies.next(30_000);
  if (!first) throw new SojaError('The open SOJA did not answer.', { hint: 'Check SOJA; it may be waiting for you (a sign-in, a confirmation).' });
  if (first.type === 'error') throw new SojaError(first.message, first.hint ? { hint: first.hint } : {});
  if (first.type !== 'env') throw new SojaError('The open SOJA stopped this before it started.');

  const count = Object.keys(first.variables).length;
  const until = first.expiresAt ? ` · until ${new Date(first.expiresAt).toLocaleString()}` : '';
  process.stderr.write(`${paint('dim', `▶ ${first.project.name} · ${first.environment} · ${count} variable${count === 1 ? '' : 's'}${until}`, process.stderr)}\n`);

  const [program, ...rest] = command;
  if (!program) throw new ValidationError('Say what to run: `soja run -- npm run dev`.');
  // No shell: arguments reach the program exactly as typed.
  const child = spawn(program, rest, { stdio: 'inherit', env: { ...process.env, ...first.variables } });
  let stopping = false;
  const stop = async (why: string) => {
    if (stopping || child.pid === undefined || child.exitCode !== null) return;
    stopping = true;
    process.stderr.write(`\n${paint('dim', `■ Stopping: ${why}.`, process.stderr)}\n`);
    await stopTree(child.pid);
  };

  // Ctrl+C goes to the whole terminal group: let the program handle it and exit on its own.
  process.on('SIGINT', () => undefined);
  for (const name of ['SIGTERM', 'SIGHUP'] as const) process.on(name, () => void stop('this command was stopped'));
  void replies.forEach((reply) => {
    if (reply.type === 'stop') void stop(STOP_REASONS[reply.reason]);
  });
  // The open SOJA vanished (closed, crashed): the variables go with it.
  socket.on('close', () => void stop(STOP_REASONS.closed));

  const exit = await new Promise<{ code: number | null; signal: NodeJS.Signals | null; error?: Error }>((resolve) => {
    child.once('error', (error) => resolve({ code: null, signal: null, error }));
    child.once('exit', (code, signal) => resolve({ code, signal }));
  });
  socket.removeAllListeners('close');
  socket.end();
  if (exit.error) {
    const missing = (exit.error as NodeJS.ErrnoException).code === 'ENOENT';
    throw new SojaError(missing ? `${program}: command not found.` : `Could not start ${program}.`, { cause: exit.error });
  }
  process.exitCode = exit.code ?? (exit.signal ? 128 + signalNumber(exit.signal) : 1);
}

export function parseRun(args: string[]): { environment: EnvEnvironment | undefined; command: string[] } {
  let environment: EnvEnvironment | undefined;
  let index = 0;
  for (; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--') {
      index += 1;
      break;
    }
    if (arg === '-e' || arg === '--env') {
      environment = oneOf(args[index + 1], ENV_ENVIRONMENTS, 'environment');
      if (!environment) throw new ValidationError('Missing environment after -e.', { hint: `Use one of: ${ENV_ENVIRONMENTS.join(', ')}.` });
      index += 1;
      continue;
    }
    if (arg?.startsWith('-')) throw new ValidationError(`Unknown option ${arg}.`, { hint: 'Usage: soja run [-e <environment>] -- <command…>' });
    break;
  }
  const command = args.slice(index);
  if (!command.length) throw new ValidationError('Say what to run.', { hint: 'Usage: soja run [-e <environment>] -- <command…>, e.g. `soja run -- npm run dev`.' });
  return { environment, command };
}

function connect(path: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const socket = createConnection(path);
    socket.once('connect', () => resolve(socket));
    socket.once('error', (error: NodeJS.ErrnoException) => {
      const closed = error.code === 'ENOENT' || error.code === 'ECONNREFUSED';
      reject(new SojaError(closed ? 'SOJA is not open.' : 'Could not reach the open SOJA.', {
        hint: 'Open SOJA (`soja`) in another terminal: shared variables are only available while it runs.',
        cause: error,
      }));
    });
  });
}

/** Newline-delimited JSON replies from the agent. */
function lines(socket: Socket) {
  let buffer = '';
  const queue: AgentReply[] = [];
  const waiting: ((reply: AgentReply | null) => void)[] = [];
  let ended = false;
  let consumer: ((reply: AgentReply) => void) | null = null;
  socket.setEncoding('utf8');
  socket.on('data', (chunk: string) => {
    buffer += chunk;
    for (let newline = buffer.indexOf('\n'); newline >= 0; newline = buffer.indexOf('\n')) {
      const line = buffer.slice(0, newline);
      buffer = buffer.slice(newline + 1);
      let reply: AgentReply;
      try {
        reply = JSON.parse(line) as AgentReply;
      } catch {
        continue;
      }
      const next = waiting.shift();
      if (next) next(reply);
      else if (consumer) consumer(reply);
      else queue.push(reply);
    }
  });
  socket.on('close', () => {
    ended = true;
    for (const next of waiting.splice(0)) next(null);
  });
  return {
    next(timeoutMs: number): Promise<AgentReply | null> {
      const queued = queue.shift();
      if (queued) return Promise.resolve(queued);
      if (ended) return Promise.resolve(null);
      return new Promise((resolve) => {
        const timer = setTimeout(() => resolve(null), timeoutMs);
        waiting.push((reply) => {
          clearTimeout(timer);
          resolve(reply);
        });
      });
    },
    forEach(handler: (reply: AgentReply) => void): Promise<void> {
      for (const reply of queue.splice(0)) handler(reply);
      consumer = handler;
      return Promise.resolve();
    },
  };
}

function signalNumber(signal: NodeJS.Signals): number {
  const numbers: Partial<Record<NodeJS.Signals, number>> = { SIGHUP: 1, SIGINT: 2, SIGKILL: 9, SIGTERM: 15 };
  return numbers[signal] ?? 1;
}
