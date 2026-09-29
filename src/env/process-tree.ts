import { execFile } from 'node:child_process';

/** Every process started under `pid` (children, grandchildren…), found with `ps`. */
export async function descendants(pid: number): Promise<number[]> {
  const table = await new Promise<string>((resolve) => {
    execFile('ps', ['-A', '-o', 'pid=', '-o', 'ppid='], (error, stdout) => resolve(error ? '' : stdout));
  });
  const children = new Map<number, number[]>();
  for (const line of table.split('\n')) {
    const [child, parent] = line.trim().split(/\s+/).map(Number);
    if (!child || parent === undefined || Number.isNaN(parent)) continue;
    children.set(parent, [...(children.get(parent) ?? []), child]);
  }
  const found: number[] = [];
  const queue = [...(children.get(pid) ?? [])];
  while (queue.length) {
    const next = queue.shift();
    if (next === undefined || found.includes(next)) continue;
    found.push(next);
    queue.push(...(children.get(next) ?? []));
  }
  return found;
}

function alive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function signal(pid: number, name: NodeJS.Signals): void {
  try {
    process.kill(pid, name);
  } catch {
    // Already gone.
  }
}

/**
 * Stops a process and everything it started: SIGTERM first, SIGKILL for
 * whatever is still running after `graceMs`. `npm run dev` usually leaves a
 * node process behind if only npm is stopped.
 */
export async function stopTree(pid: number, graceMs = 3000): Promise<void> {
  const all = [pid, ...(await descendants(pid))];
  for (const each of all) signal(each, 'SIGTERM');
  const deadline = Date.now() + graceMs;
  while (Date.now() < deadline && all.some(alive)) await new Promise((resolve) => setTimeout(resolve, 50));
  for (const each of [...all, ...(await descendants(pid))]) if (alive(each)) signal(each, 'SIGKILL');
}
