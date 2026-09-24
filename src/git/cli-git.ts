import { spawn } from 'node:child_process';
import type { GitConsole } from './console.js';
import { diagnose } from './diagnose.js';
import type { LoggedCommit } from './merge-evidence.js';
import { GitError, type ChangedFile, type ChangeKind, type GitClient, type GitCommit, type RemoteOptions } from './types.js';

interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

interface RunOptions {
  /** Resolve with a non-zero exit code instead of throwing. */
  allowFailure?: boolean;
  /** Show the command and its output in the live console. */
  stream?: boolean;
  /** What the operation was, for the error message ("Could not merge."). */
  failure?: string;
  /** Environment additions. */
  env?: Record<string, string>;
}

const FIELD = '\x1f';
const RECORD = '\x1e';
const LOG_FORMAT = `--format=%H${FIELD}%h${FIELD}%s${FIELD}%an${FIELD}%at${RECORD}`;

/** Never block waiting for credentials unless running interactively. */
const NON_INTERACTIVE = {
  GIT_TERMINAL_PROMPT: '0',
  GCM_INTERACTIVE: 'never',
  GH_PROMPT_DISABLED: '1',
};

/**
 * GitClient backed by the `git` and `gh` executables. Arguments are passed as
 * an array (no shell). Output is forced to English so failures can be
 * recognized; changing commands stream to the live console.
 */
export class CliGit implements GitClient {
  constructor(
    private readonly console?: GitConsole,
    private readonly binaries = { git: 'git', gh: 'gh' },
  ) {}

  // ── Read-only ───────────────────────────────────────────────────────────

  async repositoryRoot(path: string): Promise<string | null> {
    const result = await this.git(['-C', path, 'rev-parse', '--show-toplevel'], { allowFailure: true });
    return result.code === 0 ? result.stdout.trim() : null;
  }

  async currentBranch(root: string): Promise<string | null> {
    const result = await this.git(['-C', root, 'symbolic-ref', '--quiet', '--short', 'HEAD'], { allowFailure: true });
    return result.code === 0 ? result.stdout.trim() : null;
  }

  async branchExists(root: string, branch: string): Promise<boolean> {
    const result = await this.git(['-C', root, 'show-ref', '--verify', '--quiet', `refs/heads/${branch}`], {
      allowFailure: true,
    });
    return result.code === 0;
  }

  async isValidBranchName(root: string, branch: string): Promise<boolean> {
    const result = await this.git(['-C', root, 'check-ref-format', '--branch', branch], { allowFailure: true });
    return result.code === 0;
  }

  async uncommittedChanges(root: string): Promise<number> {
    return (await this.changedFiles(root)).length;
  }

  async commitsOnlyOn(root: string, branch: string, limit: number): Promise<GitCommit[]> {
    // With --branches, --exclude patterns are matched without the refs/heads/ prefix.
    const result = await this.git(
      ['-C', root, 'log', LOG_FORMAT, `--max-count=${limit}`, `refs/heads/${branch}`, '--not', `--exclude=${branch}`, '--branches'],
      { allowFailure: true },
    );
    return result.code === 0 ? parseLog(result.stdout) : [];
  }

  async commitsMatching(root: string, pattern: string, limit: number): Promise<GitCommit[]> {
    const result = await this.git(
      ['-C', root, 'log', LOG_FORMAT, `--max-count=${limit}`, '--branches', '--regexp-ignore-case', '--extended-regexp', `--grep=${pattern}`],
      { allowFailure: true },
    );
    return result.code === 0 ? parseLog(result.stdout) : [];
  }

  async originUrl(root: string): Promise<string | null> {
    const result = await this.git(['-C', root, 'remote', 'get-url', 'origin'], { allowFailure: true });
    return result.code === 0 ? result.stdout.trim() || null : null;
  }

  async changedFiles(root: string): Promise<ChangedFile[]> {
    const result = await this.git(['-C', root, 'status', '--porcelain=v1', '-z', '--untracked-files=all']);
    return parseStatus(result.stdout);
  }

  async isMerging(root: string): Promise<boolean> {
    const result = await this.git(['-C', root, 'rev-parse', '--quiet', '--verify', 'MERGE_HEAD'], { allowFailure: true });
    return result.code === 0;
  }

  async isMergedInto(root: string, branch: string, into: string): Promise<boolean> {
    const result = await this.git(['-C', root, 'merge-base', '--is-ancestor', `refs/heads/${branch}`, `refs/heads/${into}`], {
      allowFailure: true,
    });
    return result.code === 0;
  }

  async resolveCommit(root: string, ref: string): Promise<string | null> {
    const result = await this.git(['-C', root, 'rev-parse', '--quiet', '--verify', `${ref}^{commit}`], { allowFailure: true });
    return result.code === 0 ? result.stdout.trim() : null;
  }

  async countCommits(root: string, from: string, to: string): Promise<number> {
    const result = await this.git(['-C', root, 'rev-list', '--count', `${from}..${to}`], { allowFailure: true });
    return result.code === 0 ? Number(result.stdout.trim()) || 0 : 0;
  }

  async recentCommits(root: string, branch: string, options: { since?: string | null; limit: number }): Promise<LoggedCommit[]> {
    const range = options.since ? `${options.since}..refs/heads/${branch}` : `refs/heads/${branch}`;
    const result = await this.git(
      ['-C', root, 'log', `--format=%H${FIELD}%P${FIELD}%B${RECORD}`, `--max-count=${options.limit}`, range],
      { allowFailure: true },
    );
    if (result.code !== 0) return [];
    return result.stdout
      .split(RECORD)
      .map((record) => record.replace(/^\n+/, ''))
      .filter((record) => record.trim())
      .flatMap((record) => {
        const [hash, parents, message] = record.split(FIELD);
        return hash ? [{ hash: hash.trim(), parents: (parents ?? '').split(' ').filter(Boolean), message: (message ?? '').trim() }] : [];
      });
  }

  async defaultBranch(root: string): Promise<string | null> {
    const head = await this.git(['-C', root, 'symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD'], {
      allowFailure: true,
    });
    const remoteDefault = head.code === 0 ? head.stdout.trim().replace(/^origin\//, '') : null;
    for (const candidate of [remoteDefault, 'main', 'master']) {
      if (candidate && (await this.branchExists(root, candidate))) return candidate;
    }
    return null;
  }

  // ── Changing the repository (streamed) ─────────────────────────────────

  async createBranch(root: string, branch: string, from?: string): Promise<void> {
    await this.git(['-C', root, 'switch', '--create', branch, ...(from ? [from] : [])], {
      stream: true,
      failure: `Could not create ${branch}.`,
    });
  }

  async switchBranch(root: string, branch: string): Promise<void> {
    await this.git(['-C', root, 'switch', branch], { stream: true, failure: `Could not switch to ${branch}.` });
  }

  async commit(root: string, message: string, files: readonly Pick<ChangedFile, 'path' | 'previousPath'>[]): Promise<string> {
    // `add -A` records new, modified and deleted files. The old side of a rename
    // no longer exists anywhere, so it only goes to the commit pathspec, where
    // `--only` includes its removal and ignores anything else already staged.
    const current = files.map((file) => file.path);
    const all = [...new Set(files.flatMap((file) => (file.previousPath ? [file.path, file.previousPath] : [file.path])))];
    await this.git(['-C', root, 'add', '--all', '--', ...current], { stream: true, failure: 'Could not stage the files.' });
    await this.git(['-C', root, 'commit', '--only', '-m', message, '--', ...all], {
      stream: true,
      failure: 'Could not commit.',
    });
    return (await this.git(['-C', root, 'rev-parse', 'HEAD'])).stdout.trim();
  }

  async merge(root: string, branch: string, into: string, message: string): Promise<string> {
    await this.switchBranch(root, into);
    await this.git(['-C', root, 'merge', '--no-ff', '--no-edit', '-m', message, branch], {
      stream: true,
      failure: `Could not merge ${branch} into ${into}.`,
    });
    return (await this.git(['-C', root, 'rev-parse', 'HEAD'])).stdout.trim();
  }

  async abortMerge(root: string): Promise<void> {
    await this.git(['-C', root, 'merge', '--abort'], { stream: true, failure: 'Could not abort the merge.' });
  }

  async deleteBranch(root: string, branch: string, force: boolean): Promise<void> {
    await this.git(['-C', root, 'branch', force ? '-D' : '-d', branch], {
      stream: true,
      failure: `Could not delete ${branch}.`,
    });
  }

  async push(root: string, branch: string, options: RemoteOptions = {}): Promise<void> {
    const args = ['-C', root, 'push', '--set-upstream', 'origin', branch];
    if (options.interactive) {
      await this.attached(this.binaries.git, args, `Could not push ${branch}.`);
      return;
    }
    await this.git(args, { stream: true, failure: `Could not push ${branch}.` });
  }

  async createPullRequest(
    root: string,
    request: { base: string; head: string; title: string; body: string },
    options: RemoteOptions = {},
  ): Promise<string> {
    const args = ['pr', 'create', '--base', request.base, '--head', request.head, '--title', request.title, '--body', request.body];
    if (options.interactive) {
      await this.attached(this.binaries.gh, args, 'Could not open the pull request.', root);
      const view = await this.run(this.binaries.gh, ['pr', 'view', request.head, '--json', 'url', '--jq', '.url'], {
        cwd: root,
        allowFailure: true,
      });
      return view.stdout.trim();
    }
    const result = await this.run(this.binaries.gh, args, { cwd: root, stream: true, failure: 'Could not open the pull request.' });
    return result.stdout.match(/https?:\/\/\S+/)?.[0] ?? result.stdout.trim();
  }

  async loginGitHub(): Promise<void> {
    await this.attached(this.binaries.gh, ['auth', 'login'], 'GitHub login did not finish.');
  }

  // ── Process plumbing ────────────────────────────────────────────────────

  private git(args: string[], options: RunOptions = {}): Promise<RunResult> {
    return this.run(this.binaries.git, args, options);
  }

  private run(binary: string, args: string[], options: RunOptions & { cwd?: string } = {}): Promise<RunResult> {
    if (options.stream) this.console?.write('command', `$ ${describeCommand(binary, args)}`);

    return new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';
      const child = spawn(binary, args, {
        cwd: options.cwd,
        env: { ...process.env, ...NON_INTERACTIVE, LC_ALL: 'C', LANG: 'C', ...options.env },
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const timer = setTimeout(() => child.kill('SIGTERM'), 120_000);

      child.stdout.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        stdout += text;
        if (options.stream) this.console?.write('stdout', text);
      });
      child.stderr.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        stderr += text;
        if (options.stream) this.console?.write('stderr', text);
      });
      child.on('error', (error: NodeJS.ErrnoException) => {
        clearTimeout(timer);
        reject(missingBinary(binary, error));
      });
      child.on('close', (exitCode) => {
        clearTimeout(timer);
        const code = exitCode ?? 1;
        if (code !== 0 && !options.allowFailure) {
          const found = diagnose(`${stderr}\n${stdout}`, options.failure ?? `${binary} failed.`);
          if (options.stream) this.console?.write('error', found.message);
          reject(new GitError(found.message, { code: found.code, suggestions: found.suggestions }));
          return;
        }
        resolve({ code, stdout, stderr });
      });
    });
  }

  /**
   * Runs attached to the real terminal, so Git, ssh or gh can prompt for
   * credentials. Output goes straight to the terminal, not to the console.
   */
  private attached(binary: string, args: string[], failure: string, cwd?: string): Promise<void> {
    this.console?.write('command', `$ ${describeCommand(binary, args)}  (interactive)`);
    return new Promise((resolve, reject) => {
      const child = spawn(binary, args, { cwd, stdio: 'inherit', env: process.env });
      child.on('error', (error: NodeJS.ErrnoException) => reject(missingBinary(binary, error)));
      child.on('close', (code) => {
        if (code === 0) {
          this.console?.write('info', 'Finished in the terminal.');
          resolve();
        } else {
          this.console?.write('error', `${failure} (exit ${code ?? 'signal'})`);
          reject(new GitError(failure, { suggestions: ['Check the messages printed in the terminal.'] }));
        }
      });
    });
  }
}

/** `git -C /repo commit -m x` → `git commit -m x` (the repository is implied). */
function describeCommand(binary: string, args: string[]): string {
  const shown = args.filter((_, index) => args[index] !== '-C' && args[index - 1] !== '-C');
  return [binary.split('/').at(-1) ?? binary, ...shown.map((arg) => (/\s/.test(arg) ? JSON.stringify(arg) : arg))].join(' ');
}

function missingBinary(binary: string, error: NodeJS.ErrnoException): Error {
  if (error.code !== 'ENOENT') return error;
  return binary.endsWith('gh')
    ? new GitError('The GitHub CLI (gh) is not installed.', {
        code: 'gh_missing',
        suggestions: ['Install it from https://cli.github.com, then run `gh auth login`.'],
      })
    : new GitError('Git is not installed or not on your PATH.', { code: 'not_installed', cause: error });
}

const KINDS: Record<string, ChangeKind> = {
  M: 'modified',
  A: 'added',
  D: 'deleted',
  R: 'renamed',
  C: 'copied',
  T: 'typechange',
};

/** Parses `git status --porcelain=v1 -z`. */
export function parseStatus(output: string): ChangedFile[] {
  const entries = output.split('\0');
  const files: ChangedFile[] = [];
  for (let index = 0; index < entries.length; index += 1) {
    const entry = entries[index];
    if (!entry || entry.length < 4) continue;
    const x = entry[0] ?? ' ';
    const y = entry[1] ?? ' ';
    const path = entry.slice(3);
    if (x === '?' && y === '?') {
      files.push({ path, kind: 'untracked', staged: false });
      continue;
    }
    const conflicted = x === 'U' || y === 'U' || (x === 'A' && y === 'A') || (x === 'D' && y === 'D');
    const code = x !== ' ' ? x : y;
    const file: ChangedFile = { path, kind: conflicted ? 'conflicted' : (KINDS[code] ?? 'modified'), staged: x !== ' ' && x !== '?' };
    if (x === 'R' || x === 'C') {
      // In -z mode the original path follows as its own entry.
      const previous = entries[index + 1];
      if (previous) file.previousPath = previous;
      index += 1;
    }
    files.push(file);
  }
  return files;
}

function parseLog(output: string): GitCommit[] {
  return output
    .split(RECORD)
    .map((record) => record.trim())
    .filter(Boolean)
    .flatMap((record) => {
      const [hash, shortHash, subject, author, timestamp] = record.split(FIELD);
      if (!hash || !shortHash || subject === undefined || !author || !timestamp) return [];
      return [{ hash, shortHash, subject, author, date: new Date(Number(timestamp) * 1000) }];
    });
}
