import { chmodSync, lstatSync, mkdirSync, type Stats } from 'node:fs';
import { tmpdir, userInfo } from 'node:os';
import { dirname, isAbsolute, join } from 'node:path';
import { SojaError } from '../domain/errors.js';

/*
 * Where the agent of the open SOJA listens: a Unix socket in a folder only you
 * can open. Anyone who can connect to it can ask for variables, and anyone who
 * could listen there could hand `soja run` variables of their choosing, so both
 * sides check the folder and the socket (like ssh-agent's).
 */

const unsupported = () =>
  new SojaError('Shared environment variables are not available on Windows yet.', { hint: 'Use SOJA on Linux or macOS (WSL works) for `soja run`.' });

export function agentSocketPath(env: NodeJS.ProcessEnv = process.env): string {
  const runtime = env.XDG_RUNTIME_DIR;
  const dir = runtime && isAbsolute(runtime) ? join(runtime, 'soja') : join(tmpdir(), `soja-${process.getuid?.() ?? userInfo().uid}`);
  return join(dir, 'agent.sock');
}

function uid(): number {
  const id = process.getuid?.();
  if (id === undefined) throw unsupported();
  return id;
}

function mine(info: Stats): boolean {
  return info.uid === uid() && !info.isSymbolicLink();
}

/** Agent side: creates the socket's folder (0700) and refuses one that someone else prepared. */
export function prepareSocketFolder(socketPath: string): void {
  if (process.platform === 'win32') throw unsupported();
  const dir = dirname(socketPath);
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const info = lstatSync(dir);
  if (!info.isDirectory() || !mine(info)) {
    throw new SojaError(`${dir} is not a folder of yours: SOJA will not serve variables from it.`, { hint: 'Someone else may have created it. Remove it, or set XDG_RUNTIME_DIR, and open SOJA again.' });
  }
  if ((info.mode & 0o077) !== 0) chmodSync(dir, 0o700);
}

/** `soja run` side: only talks to a socket that is yours, in a folder only you can open. */
export function checkAgentSocket(socketPath: string): 'ok' | 'missing' {
  if (process.platform === 'win32') throw unsupported();
  const dir = dirname(socketPath);
  let folder: Stats;
  try {
    folder = lstatSync(dir);
  } catch {
    return 'missing';
  }
  const refuse = () =>
    new SojaError(`${socketPath} is not SOJA's: soja run will not use it.`, { hint: 'Someone else may be listening there. Remove it, or set XDG_RUNTIME_DIR, and open SOJA again.' });
  if (!folder.isDirectory() || !mine(folder) || (folder.mode & 0o077) !== 0) throw refuse();
  let socket: Stats;
  try {
    socket = lstatSync(socketPath);
  } catch {
    return 'missing';
  }
  if (!socket.isSocket() || !mine(socket)) throw refuse();
  return 'ok';
}
