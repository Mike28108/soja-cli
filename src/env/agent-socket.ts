import { chmodSync, lstatSync, mkdirSync } from 'node:fs';
import { tmpdir, userInfo } from 'node:os';
import { isAbsolute, join } from 'node:path';
import { SojaError } from '../domain/errors.js';

/**
 * Where the agent of the open SOJA listens: a Unix socket in a folder only you
 * can open. Anyone who can connect to it can ask for variables, so the folder
 * is the boundary (like ssh-agent's).
 */
export function agentSocketPath(env: NodeJS.ProcessEnv = process.env): string {
  if (process.platform === 'win32') return `\\\\.\\pipe\\soja-agent-${userInfo().username}`;
  const runtime = env.XDG_RUNTIME_DIR;
  const dir = runtime && isAbsolute(runtime) ? join(runtime, 'soja') : join(tmpdir(), `soja-${process.getuid?.() ?? userInfo().uid}`);
  return join(dir, 'agent.sock');
}

/** Creates the socket's folder (0700) and refuses one that someone else could have prepared. */
export function prepareSocketFolder(socketPath: string): void {
  if (process.platform === 'win32') return;
  const dir = socketPath.slice(0, socketPath.lastIndexOf('/'));
  mkdirSync(dir, { recursive: true, mode: 0o700 });
  const info = lstatSync(dir);
  const uid = process.getuid?.();
  if (!info.isDirectory() || info.isSymbolicLink() || (uid !== undefined && info.uid !== uid)) {
    throw new SojaError(`${dir} is not a folder of yours.`, { hint: 'Remove it and open SOJA again.' });
  }
  if ((info.mode & 0o077) !== 0) chmodSync(dir, 0o700);
}
