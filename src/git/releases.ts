import { spawn } from 'node:child_process';
import { mkdtempSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GitError } from './types.js';

/** SOJA's own releases on GitHub, read and downloaded with the GitHub CLI (the repository is private). */
export interface ReleaseSource {
  /** Tag of the newest release, e.g. `v1.0.0`. */
  latest(): Promise<string>;
  /** Downloads the release's package and returns its path. */
  download(tag: string): Promise<string>;
  /** Installs a downloaded package globally, attached to the terminal (npm may ask for permissions). */
  install(packagePath: string): Promise<void>;
}

export class GhReleases implements ReleaseSource {
  constructor(
    private readonly repository: string,
    private readonly gh = 'gh',
  ) {}

  async latest(): Promise<string> {
    const output = await run(this.gh, ['release', 'view', '--repo', this.repository, '--json', 'tagName', '--jq', '.tagName']);
    return output.trim();
  }

  async download(tag: string): Promise<string> {
    const dir = mkdtempSync(join(tmpdir(), 'soja-update-'));
    await run(this.gh, ['release', 'download', tag, '--repo', this.repository, '--pattern', 'soja-cli-*.tgz', '--dir', dir]);
    const file = readdirSync(dir).find((name) => name.endsWith('.tgz'));
    if (!file) throw new GitError(`Release ${tag} has no package to install.`, { suggestions: ['It may still be building; try again in a few minutes.'] });
    return join(dir, file);
  }

  install(packagePath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn('npm', ['install', '--global', packagePath], { stdio: 'inherit' });
      child.on('error', reject);
      child.on('close', (code) =>
        code === 0 ? resolve() : reject(new GitError('npm could not install the update.', { suggestions: ['Check the npm messages above (a global prefix may need permissions).'] })),
      );
    });
  }
}

function run(binary: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    const child = spawn(binary, args, { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, GH_PROMPT_DISABLED: '1' } });
    child.stdout.on('data', (chunk: Buffer) => (stdout += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (stderr += chunk.toString()));
    child.on('error', (error: NodeJS.ErrnoException) =>
      reject(
        error.code === 'ENOENT'
          ? new GitError('The GitHub CLI (gh) is not installed.', { code: 'gh_missing', suggestions: ['Install it from https://cli.github.com, then run `gh auth login`.'] })
          : error,
      ),
    );
    child.on('close', (code) => {
      if (code === 0) return resolve(stdout);
      const auth = /gh auth login|not logged in|HTTP 401|HTTP 404/i.test(stderr);
      reject(
        new GitError(auth ? 'GitHub did not let SOJA read its releases.' : `gh failed: ${stderr.trim().split('\n')[0] ?? ''}`, {
          code: auth ? 'gh_auth' : 'failed',
          suggestions: auth ? ['Run `gh auth login` with an account that can see the SOJA repository.'] : [],
        }),
      );
    });
  });
}
