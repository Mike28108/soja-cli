import { createInterface } from 'node:readline/promises';
import type { AppServices } from '../../application/services/index.js';
import type { Session } from '../../application/types.js';
import { ValidationError } from '../../domain/errors.js';
import { GitError } from '../../git/types.js';
import { symbols } from '../../ui/theme/theme.js';
import { bold, color, dim, paint, print, success } from '../output.js';
import { withSession } from '../runtime.js';
import { parseCommand, requireArg } from './args.js';

/**
 * Runs `work` while mirroring the Git console to stderr, so the commands and
 * their output show up live in the terminal. GitErrors get their suggestions.
 */
async function withGit<T>(work: (services: AppServices, session: Session) => Promise<T>): Promise<T> {
  return withSession(async (services, session) => {
    let shown = services.gitConsole.lastId;
    const stop = services.gitConsole.subscribe(() => {
      for (const line of services.gitConsole.since(shown)) {
        const text = line.kind === 'command' ? paint('bold', line.text, process.stderr) : paint('dim', `  ${line.text}`, process.stderr);
        if (line.kind !== 'success' && line.kind !== 'error') process.stderr.write(`${text}\n`);
        shown = line.id;
      }
    });
    try {
      return await work(services, session);
    } catch (error) {
      if (error instanceof GitError && error.suggestions.length > 1) {
        // printError shows the first suggestion as the hint; list the rest too.
        for (const suggestion of error.suggestions.slice(1)) process.stderr.write(`${paint('dim', `  ${symbols.arrow} ${suggestion}`, process.stderr)}\n`);
      }
      throw error;
    } finally {
      stop();
    }
  });
}

async function confirm(question: string, yes: boolean | undefined): Promise<boolean> {
  if (yes) return true;
  if (!process.stdin.isTTY) throw new ValidationError('Refusing to continue without confirmation.', { hint: 'Pass --yes.' });
  const readline = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return /^y(es)?$/i.test((await readline.question(`${question} ${dim('[y/N]')} `)).trim());
  } finally {
    readline.close();
  }
}

const interactive = () => Boolean(process.stdin.isTTY && process.stdout.isTTY);

/** `soja commit <id> -m <message> [files…] [--all]` */
export async function commitCommand(args: string[]): Promise<void> {
  const { values, positionals } = parseCommand(args, {
    message: { type: 'string', short: 'm' },
    all: { type: 'boolean', short: 'a' },
  });
  const ref = requireArg(positionals[0], 'task ID', 'soja commit SOJA-12 -m "Fix webhook" [files…|--all]');
  const message = requireArg(values.message, 'commit message', 'soja commit SOJA-12 -m "Fix webhook" --all');
  await withGit(async (services, session) => {
    let paths = positionals.slice(1);
    if (paths.length === 0) {
      const { files } = await services.git.workingState(session, ref, process.cwd());
      if (!values.all) {
        throw new ValidationError('Choose the files to commit, or pass --all.', {
          hint: files.length ? `Changed: ${files.map((file) => file.path).join(', ')}` : 'There are no changes.',
        });
      }
      paths = files.map((file) => file.path);
    }
    const result = await services.git.commit(session, ref, { cwd: process.cwd(), message, paths });
    success(`Committed ${color('yellow', result.hash.slice(0, 7))} ${result.subject} ${dim(`(${result.files} file${result.files === 1 ? '' : 's'})`)}`);
  });
}

/** `soja merge <id> [--delete] [--done] [--yes]` */
export async function mergeCommand(args: string[]): Promise<void> {
  const { values, positionals } = parseCommand(args, {
    delete: { type: 'boolean', short: 'd' },
    done: { type: 'boolean' },
    yes: { type: 'boolean', short: 'y' },
  });
  const ref = requireArg(positionals[0], 'task ID', 'soja merge SOJA-12 [--delete] [--done]');
  await withGit(async (services, session) => {
    const cwd = process.cwd();
    const plan = await services.git.mergePlan(session, ref, cwd);
    if (!(await confirm(`Merge ${bold(plan.branch)} into ${bold(plan.into)}?`, values.yes))) return print(dim('Cancelled.'));
    const result = await services.git.merge(session, ref, { cwd });
    success(`Merged ${result.branch} into ${result.into} ${dim(result.hash.slice(0, 7))}`);
    if (values.delete) {
      const deleted = await services.git.deleteBranch(session, ref, { cwd });
      success(`Deleted ${deleted.branch}`);
    }
    if (values.done) {
      const task = await services.tasks.complete(session, ref);
      success(`${task.ref} ${symbols.arrow} Done`);
    }
  });
}

/** `soja branch delete <id> [--force] [--yes]` */
export async function branchCommand(args: string[]): Promise<void> {
  const [sub, ...rest] = args;
  if (sub !== 'delete' && sub !== 'rm') {
    throw new ValidationError(`Unknown branch command “${sub ?? ''}”.`, { hint: 'Try: soja branch delete SOJA-12' });
  }
  const { values, positionals } = parseCommand(rest, {
    force: { type: 'boolean', short: 'f' },
    yes: { type: 'boolean', short: 'y' },
  });
  const ref = requireArg(positionals[0], 'task ID', 'soja branch delete SOJA-12 [--force]');
  await withGit(async (services, session) => {
    const task = await services.tasks.get(session, ref);
    if (!task.branch) throw new GitError(`${task.ref} has no branch.`);
    const question = values.force
      ? `Delete ${bold(task.branch)} even if it is NOT merged? Its unmerged commits will be lost.`
      : `Delete ${bold(task.branch)}?`;
    if (!(await confirm(question, values.yes))) return print(dim('Cancelled.'));
    const result = await services.git.deleteBranch(session, ref, { cwd: process.cwd(), force: values.force ?? false });
    success(`Deleted ${result.branch}${result.switchedTo ? dim(` (switched to ${result.switchedTo})`) : ''}${result.merged ? '' : dim(' (was not merged)')}`);
  }).catch((error: unknown) => {
    if (error instanceof GitError && error.code === 'not_merged') {
      throw new GitError(error.message, { code: error.code, suggestions: ['Merge it first (`soja merge`), or pass --force to delete it anyway.'] });
    }
    throw error;
  });
}

/** `soja push <id>` */
export async function pushCommand(args: string[]): Promise<void> {
  const { positionals } = parseCommand(args, {});
  const ref = requireArg(positionals[0], 'task ID', 'soja push SOJA-12');
  await withGit(async (services, session) => {
    // Attached to the terminal, Git can ask for credentials itself.
    const result = await services.git.push(session, ref, { cwd: process.cwd(), interactive: interactive() });
    success(`Pushed ${result.branch} to origin`);
  });
}

/** `soja pr <id> [--yes]` */
export async function pullRequestCommand(args: string[]): Promise<void> {
  const { values, positionals } = parseCommand(args, { yes: { type: 'boolean', short: 'y' } });
  const ref = requireArg(positionals[0], 'task ID', 'soja pr SOJA-12');
  await withGit(async (services, session) => {
    const task = await services.tasks.get(session, ref);
    if (!(await confirm(`Push ${bold(task.branch ?? task.ref)} and open a pull request?`, values.yes))) return print(dim('Cancelled.'));
    const result = await services.git.openPullRequest(session, ref, { cwd: process.cwd(), interactive: interactive() });
    success(`Pull request ${result.branch} ${symbols.arrow} ${result.base}`);
    print(`  ${result.url}`);
  });
}
