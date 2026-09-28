import { existsSync } from 'node:fs';
import type { Project } from '../../domain/entities.js';
import { SojaError } from '../../domain/errors.js';
import { formatTaskRef, isClosed, suggestBranchName, taskMentionPattern, type Task } from '../../domain/task.js';
import { findMergeEvidence } from '../../git/merge-evidence.js';
import type { ActivityEvent, GitActivityEvent } from '../../domain/activity.js';
import { ValidationError } from '../../domain/errors.js';
import { GitError, type ChangedFile, type GitClient, type GitCommit, type PullRequest, type RemoteOptions } from '../../git/types.js';
import type { Session, TaskView } from '../types.js';
import type { ProjectOperations, TaskOperations } from '../ports.js';
import type { TaskTarget } from './task-service.js';

/** What `start` would do, computed without touching the repository. */
export interface StartPlan {
  task: Task;
  root: string;
  branch: string;
  branchExists: boolean;
  checkedOut: boolean;
  currentBranch: string | null;
  uncommitted: number;
  /** The task's project has no repository yet; starting links it to `root`. */
  linkProject: Project | null;
}

export type StartAction = 'created' | 'recreated' | 'switched' | 'current';

export interface StartResult {
  task: TaskView;
  root: string;
  branch: string;
  action: StartAction;
  /** Branch or ref the new branch was created from. */
  base: string | null;
  /** Uncommitted changes that came along to the new branch. */
  carried: number;
  linked: boolean;
}

export type TaskGitState =
  | { status: 'unavailable'; reason: string; hint: string | undefined }
  | {
      status: 'ready';
      root: string;
      branch: string;
      /** False while the branch is only a suggestion. */
      recorded: boolean;
      branchExists: boolean;
      checkedOut: boolean;
      currentBranch: string | null;
      uncommitted: number;
      commits: GitCommit[];
    };

interface TaskContext {
  task: Task;
  root: string;
  currentBranch: string | null;
}

export interface WorkingState extends TaskContext {
  files: ChangedFile[];
  merging: boolean;
}

export type MergeDetection =
  | { kind: 'merged'; task: TaskView; branch: string; into: string }
  | { kind: 'deleted'; task: TaskView; branch: string };

export interface MergePlan extends TaskContext {
  branch: string;
  into: string;
  alreadyMerged: boolean;
  uncommitted: number;
}

/** A task's pull request, as the GitHub CLI reports it. Problems are reported, never thrown. */
export type TaskPullRequestState =
  | { status: 'none'; reason: string }
  | { status: 'unavailable'; reason: string; hint: string | undefined; code: string }
  | { status: 'found'; pr: PullRequest };

/** Something that happened on GitHub and SOJA just learned (and recorded). */
export type PullRequestUpdate =
  | { kind: 'merged'; task: TaskView; pr: PullRequest }
  | { kind: 'checks_failed'; task: TaskView; pr: PullRequest };

/** Reasons to think twice before merging a pull request, in plain words. */
export function pullRequestWarnings(pr: PullRequest): string[] {
  return [
    pr.checks.failed > 0 ? `${pr.checks.failed} check${pr.checks.failed === 1 ? '' : 's'} failing` : null,
    pr.checks.pending > 0 ? `${pr.checks.pending} still running` : null,
    pr.review === 'changes_requested' ? 'changes requested' : pr.review === 'review_required' ? 'not approved yet' : null,
    pr.mergeable === 'conflicting' ? 'conflicts with the base' : null,
  ].filter((warning): warning is string => warning !== null);
}

const COMMIT_LIMIT = 10;
/** Pull request lists are reused for this long, so moving around the lists does not call GitHub each time. */
const PR_CACHE_MS = 60_000;
const PR_LIST_LIMIT = 100;

/**
 * Local Git flow for tasks. Everything here works offline. Git runs first
 * and SOJA records the result afterwards, so a Git failure never leaves a
 * task "started" on a branch that does not exist.
 */
export class GitWorkflowService {
  private readonly pullRequestCache = new Map<string, { at: number; list: Promise<PullRequest[]> }>();

  constructor(
    private readonly tasks: TaskOperations,
    private readonly projects: ProjectOperations,
    private readonly git: GitClient,
    private readonly now: () => number = Date.now,
  ) {}

  /**
   * Decides the repository and branch for `target`. The repository is the
   * task's project repository; a task without a project uses the repository
   * containing `cwd`. Throws a GitError explaining what to fix otherwise.
   */
  async plan(session: Session, target: TaskTarget, cwd: string): Promise<StartPlan> {
    const task = await this.tasks.get(session, target);
    const { root, linkProject } = await this.repositoryFor(session, task, cwd);
    const branch = task.branch ?? suggestBranchName(task);
    if (!(await this.git.isValidBranchName(root, branch))) {
      throw new GitError(`“${branch}” is not a valid Git branch name.`, {
        hint: `Fix the branch recorded on ${task.ref} from its edit menu.`,
      });
    }
    const [currentBranch, branchExists, uncommitted] = await Promise.all([
      this.git.currentBranch(root),
      this.git.branchExists(root, branch),
      this.git.uncommittedChanges(root),
    ]);
    return {
      task,
      root,
      branch,
      branchExists,
      checkedOut: currentBranch === branch,
      currentBranch,
      uncommitted,
      linkProject,
    };
  }

  /**
   * `soja start`: checks out the task branch (creating it from `from`, or
   * from the current HEAD) and then assigns the task to you, moves it to
   * In Progress and records the branch.
   */
  async start(
    session: Session,
    target: TaskTarget,
    options: { cwd: string; from?: string | undefined; link?: boolean },
  ): Promise<StartResult> {
    const plan = await this.plan(session, target, options.cwd);
    const ref = formatTaskRef(plan.task.number);

    if (plan.linkProject && !options.link) {
      throw new GitError(`${plan.linkProject.name} has no repository linked.`, {
        hint: `Use --link to link ${plan.root}, or run \`soja project link ${plan.linkProject.key} <path>\`.`,
      });
    }

    let action: StartAction;
    let base: string | null = null;
    let carried = 0;
    if (plan.checkedOut) {
      action = 'current';
    } else if (plan.branchExists) {
      if (plan.uncommitted > 0) {
        throw new GitError(`${plan.root} has ${plural(plan.uncommitted, 'uncommitted change')}.`, {
          hint: `Commit or stash them before switching to ${plan.branch}.`,
        });
      }
      await this.git.switchBranch(plan.root, plan.branch);
      action = 'switched';
    } else {
      base = options.from ?? plan.currentBranch;
      await this.git.createBranch(plan.root, plan.branch, options.from);
      action = plan.task.branch ? 'recreated' : 'created';
      carried = plan.uncommitted;
    }

    // Git succeeded; from here on only SOJA's own data changes.
    let linked = false;
    if (plan.linkProject) {
      await this.projects.linkRepository(session, plan.linkProject, plan.root);
      linked = true;
    }
    let task: TaskView;
    try {
      // The base is only known when SOJA creates the branch; keep an earlier one otherwise.
      const baseBranch = base ?? plan.task.baseBranch;
      // Where the branch starts; only commits after it count as the task's own work.
      const branchStart =
        action === 'created' || action === 'recreated' ? await this.git.resolveCommit(plan.root, 'HEAD') : plan.task.branchStart;
      task = await this.tasks.start(session, plan.task, { branch: plan.branch, baseBranch, branchStart });
    } catch (error) {
      throw new SojaError(`Switched to ${plan.branch}, but ${ref} could not be updated.`, {
        hint: `Run \`soja start ${ref}\` again; the branch is already there.`,
        cause: error,
      });
    }
    return { task, root: plan.root, branch: plan.branch, action, base, carried, linked };
  }

  /** Changed files and branch context, for choosing what to commit. */
  async workingState(session: Session, target: TaskTarget, cwd: string): Promise<WorkingState> {
    const context = await this.context(session, target, cwd);
    const [files, merging] = await Promise.all([this.git.changedFiles(context.root), this.git.isMerging(context.root)]);
    return { ...context, files, merging };
  }

  /**
   * Commits exactly `paths` on the task branch. The task reference is added
   * to the message (`Fix webhook (SOJA-12)`) unless it is already there.
   */
  async commit(
    session: Session,
    target: TaskTarget,
    options: { cwd: string; message: string; paths: readonly string[] },
  ): Promise<{ hash: string; subject: string; files: number }> {
    const context = await this.context(session, target, options.cwd);
    this.requireOnTaskBranch(context);
    const text = options.message.trim();
    if (!text) throw new ValidationError('Write a commit message.');
    if (options.paths.length === 0) throw new ValidationError('Select at least one file to commit.');

    const available = await this.git.changedFiles(context.root);
    const chosen = available.filter((file) => options.paths.includes(file.path));
    if (chosen.length === 0) throw new GitError('None of those files have changes anymore.', { code: 'nothing_to_commit' });

    const ref = formatTaskRef(context.task.number);
    const mentions = new RegExp(taskMentionPattern(context.task.number), 'i').test(text);
    const message = mentions ? text : `${text} (${ref})`;
    const hash = await this.git.commit(context.root, message, chosen);
    const subject = message.split('\n')[0] ?? message;
    await this.record(session, context.task, { type: 'git_committed', metadata: { hash, subject, files: chosen.length } });
    return { hash, subject, files: chosen.length };
  }

  /** Where `merge` would go and whether it is needed. */
  async mergePlan(session: Session, target: TaskTarget, cwd: string): Promise<MergePlan> {
    const context = await this.context(session, target, cwd);
    const branch = this.requireBranch(context);
    if (!(await this.git.branchExists(context.root, branch))) {
      throw new GitError(`${branch} does not exist in this repository.`, { suggestions: ['Press b to create it again.'] });
    }
    const into = context.task.baseBranch ?? (await this.git.defaultBranch(context.root));
    if (!into || into === branch) {
      throw new GitError(`SOJA does not know which branch ${branch} should be merged into.`, {
        suggestions: ['Create a `main` branch, or merge it yourself with `git merge`.'],
      });
    }
    const [merged, files] = await Promise.all([
      this.git.isMergedInto(context.root, branch, into),
      this.git.changedFiles(context.root),
    ]);
    return { ...context, branch, into, alreadyMerged: merged, uncommitted: files.length };
  }

  /** Merges the task branch into its base with a merge commit. */
  async merge(session: Session, target: TaskTarget, options: { cwd: string }): Promise<{ hash: string; branch: string; into: string }> {
    const plan = await this.mergePlan(session, target, options.cwd);
    if (plan.alreadyMerged) {
      throw new GitError(`${plan.branch} is already merged into ${plan.into}.`, { suggestions: ['You can delete the branch (D).'] });
    }
    if (plan.uncommitted > 0) {
      throw new GitError(`${plural(plan.uncommitted, 'uncommitted change')} would get in the way of the merge.`, {
        code: 'dirty_worktree',
        suggestions: ['Commit them first (C), or run `git stash`.'],
      });
    }
    const ref = formatTaskRef(plan.task.number);
    let hash: string;
    try {
      hash = await this.git.merge(plan.root, plan.branch, plan.into, `Merge ${ref}: ${plan.task.title}`);
    } catch (error) {
      if (error instanceof GitError && error.code === 'merge_conflict') {
        const conflicts = (await this.git.changedFiles(plan.root)).filter((file) => file.kind === 'conflicted');
        throw new GitError(`Merging ${plan.branch} into ${plan.into} has conflicts in ${plural(conflicts.length, 'file')}.`, {
          code: 'merge_conflict',
          suggestions: [
            ...conflicts.slice(0, 5).map((file) => `conflict: ${file.path}`),
            ...error.suggestions,
          ],
        });
      }
      throw error;
    }
    await this.record(session, plan.task, { type: 'git_merged', metadata: { branch: plan.branch, into: plan.into, hash } });
    return { hash, branch: plan.branch, into: plan.into };
  }

  async abortMerge(session: Session, target: TaskTarget, cwd: string): Promise<void> {
    const context = await this.context(session, target, cwd);
    if (!(await this.git.isMerging(context.root))) throw new GitError('There is no merge in progress.');
    await this.git.abortMerge(context.root);
  }

  /**
   * Deletes the task branch (switching to its base first if it is checked
   * out) and forgets it on the task. Unmerged branches need `force`.
   */
  async deleteBranch(
    session: Session,
    target: TaskTarget,
    options: { cwd: string; force?: boolean },
  ): Promise<{ branch: string; merged: boolean; switchedTo: string | null }> {
    const context = await this.context(session, target, options.cwd);
    const branch = this.requireBranch(context);
    const exists = await this.git.branchExists(context.root, branch);
    const into = context.task.baseBranch ?? (await this.git.defaultBranch(context.root));
    const merged = exists && into !== null && into !== branch ? await this.git.isMergedInto(context.root, branch, into) : false;

    let switchedTo: string | null = null;
    if (exists) {
      if (!merged && !options.force) {
        throw new GitError(`${branch} has commits that are not in ${into ?? 'any base branch'}.`, {
          code: 'not_merged',
          suggestions: ['Merge it first (M), or confirm deleting it anyway. Those commits would be lost.'],
        });
      }
      if (context.currentBranch === branch) {
        if (!into || into === branch) {
          throw new GitError(`${branch} is checked out and SOJA does not know where to switch.`, {
            suggestions: ['Switch to another branch with `git switch`, then try again.'],
          });
        }
        if ((await this.git.changedFiles(context.root)).length > 0) {
          throw new GitError(`${branch} is checked out and has uncommitted changes.`, {
            code: 'dirty_worktree',
            suggestions: ['Commit them first (C), or run `git stash`.'],
          });
        }
        await this.git.switchBranch(context.root, into);
        switchedTo = into;
      }
      // Merged was verified against the base above, so -D is safe; -d would compare with HEAD instead.
      await this.git.deleteBranch(context.root, branch, true);
    }

    await this.tasks.recordGitEvent(
      session,
      context.task,
      { type: 'git_branch_deleted', metadata: { branch, merged } },
      { branch: null, baseBranch: null, branchStart: null },
    );
    return { branch, merged, switchedTo };
  }

  /** Pushes the task branch to origin. */
  async push(session: Session, target: TaskTarget, options: { cwd: string } & RemoteOptions): Promise<{ branch: string }> {
    const context = await this.context(session, target, options.cwd);
    const branch = this.requireBranch(context);
    await this.requirePushable(context.root, branch);
    await this.git.push(context.root, branch, { interactive: options.interactive ?? false });
    await this.record(session, context.task, { type: 'git_pushed', metadata: { branch, remote: 'origin' } });
    return { branch };
  }

  /** Pushes the branch and opens a pull request into its base with the GitHub CLI. */
  async openPullRequest(
    session: Session,
    target: TaskTarget,
    options: { cwd: string } & RemoteOptions,
  ): Promise<{ url: string; base: string; branch: string }> {
    const context = await this.context(session, target, options.cwd);
    const branch = this.requireBranch(context);
    await this.requirePushable(context.root, branch);
    const base = context.task.baseBranch ?? (await this.git.defaultBranch(context.root));
    if (!base || base === branch) {
      throw new GitError('SOJA does not know the base branch for the pull request.', {
        suggestions: ['Create it with `gh pr create --base <branch>`.'],
      });
    }
    const interactive = options.interactive ?? false;
    await this.git.push(context.root, branch, { interactive });

    const ref = formatTaskRef(context.task.number);
    const details = [
      context.task.description,
      context.task.requester ? `Requested by: ${context.task.requester}` : null,
      `SOJA task: ${ref}`,
    ].filter(Boolean);
    const url = await this.git.createPullRequest(
      context.root,
      { base, head: branch, title: `${context.task.title} (${ref})`, body: details.join('\n\n') },
      { interactive },
    );
    await this.record(session, context.task, { type: 'pr_opened', metadata: { url } });
    return { url, base, branch };
  }

  /**
   * Finds open tasks whose branch was merged into its base outside SOJA
   * (by hand, by an agent, or on GitHub followed by a pull) and marks them
   * Done. Also reports branches that were deleted with no sign of a merge.
   * Local and read-only on the repository; unreachable repositories are skipped.
   */
  async detectMerges(session: Session, cwd: string, options: { only?: TaskTarget } = {}): Promise<MergeDetection[]> {
    const candidates = options.only
      ? [await this.tasks.get(session, options.only)]
      : await this.tasks.list(session, 'all');
    const results: MergeDetection[] = [];
    for (const task of candidates) {
      const branch = task.branch;
      if (!branch || isClosed(task.status)) continue;
      const found = await this.checkMerged(session, { ...task, branch }, cwd).catch(() => null);
      if (!found) continue;
      if (found.kind === 'deleted') {
        results.push({ kind: 'deleted', task, branch });
        continue;
      }
      await this.record(session, task, {
        type: 'git_merge_detected',
        metadata: { branch, into: found.into, hash: found.hash },
      });
      const done = await this.tasks.complete(session, task);
      results.push({ kind: 'merged', task: done, branch, into: found.into });
    }
    return results;
  }

  /** Forgets a task's branch without touching Git (e.g. it was deleted and will not come back). */
  async forgetBranch(session: Session, target: TaskTarget): Promise<TaskView> {
    return this.tasks.update(session, target, { branch: null, baseBranch: null, branchStart: null });
  }

  // ── Pull requests on GitHub (v0.6, through the GitHub CLI) ──────────────

  /** The task's pull request, fresh from GitHub. */
  async pullRequest(session: Session, target: TaskTarget, cwd: string): Promise<TaskPullRequestState> {
    try {
      const task = await this.tasks.get(session, target);
      if (!task.branch) return { status: 'none', reason: 'No branch yet.' };
      const { root, linkProject } = await this.repositoryFor(session, task, cwd);
      if (linkProject) return { status: 'none', reason: `${linkProject.name} has no repository linked.` };
      const pr = await this.git.pullRequestFor(root, task.branch);
      return pr ? { status: 'found', pr } : { status: 'none', reason: 'No pull request yet.' };
    } catch (error) {
      if (error instanceof GitError) return { status: 'unavailable', reason: error.message, hint: error.hint, code: error.code };
      if (error instanceof SojaError) return { status: 'unavailable', reason: error.message, hint: error.hint, code: 'failed' };
      throw error;
    }
  }

  /**
   * Pull requests of open tasks, by task id (for markers in lists). Uses one
   * `gh pr list` per repository, reused for a minute. Unreachable
   * repositories and GitHub problems are skipped silently.
   */
  async pullRequestIndex(session: Session, cwd: string, tasks: readonly Task[]): Promise<Map<string, PullRequest>> {
    const index = new Map<string, PullRequest>();
    for (const [root, group] of await this.byRepository(session, cwd, tasks)) {
      const list = await this.cachedPullRequests(root).catch(() => null);
      if (!list) continue;
      for (const task of group) {
        const pr = list.find((candidate) => candidate.head === task.branch);
        if (pr) index.set(task.id, pr);
      }
    }
    return index;
  }

  /**
   * Learns what happened on GitHub to open tasks: a merged pull request
   * closes its task (`pr_merged`), and failing checks on a new commit are
   * recorded once (`pr_checks_failed`), so in remote mode the whole team
   * sees them. `only` checks one task with fresh data.
   */
  async followPullRequests(session: Session, cwd: string, options: { only?: TaskTarget } = {}): Promise<PullRequestUpdate[]> {
    const candidates = (options.only ? [await this.tasks.get(session, options.only)] : await this.tasks.list(session, 'all')).filter(
      (task) => task.branch && !isClosed(task.status),
    );
    const updates: PullRequestUpdate[] = [];
    for (const [root, group] of await this.byRepository(session, cwd, candidates)) {
      let list: PullRequest[];
      try {
        const only = options.only ? group[0] : undefined;
        list = only?.branch ? [await this.git.pullRequestFor(root, only.branch)].filter((pr): pr is PullRequest => pr !== null) : await this.cachedPullRequests(root);
      } catch {
        continue; // gh missing, logged out or offline: nothing to learn right now
      }
      for (const task of group) {
        const pr = list.find((candidate) => candidate.head === task.branch);
        if (!pr) continue;
        // Acted on once per pull request: a task reopened after its merge stays open.
        if (pr.state === 'merged' && !(await this.recorded(session, task, (event) => event.type === 'pr_merged' && event.metadata.number === pr.number))) {
          await this.record(session, task, { type: 'pr_merged', metadata: { number: pr.number, url: pr.url, into: pr.base, via: 'github' } });
          updates.push({ kind: 'merged', task: await this.tasks.complete(session, task), pr });
        } else if (
          pr.state === 'open' &&
          pr.checks.failed > 0 &&
          pr.headSha &&
          !(await this.recorded(session, task, (event) => event.type === 'pr_checks_failed' && event.metadata.sha === pr.headSha))
        ) {
          await this.record(session, task, {
            type: 'pr_checks_failed',
            metadata: { number: pr.number, url: pr.url, sha: pr.headSha, checks: pr.checks.failing.slice(0, 20) },
          });
          updates.push({ kind: 'checks_failed', task, pr });
        }
      }
    }
    return updates;
  }

  /**
   * Merges the task's pull request on GitHub (merge commit), closes the task
   * and, if asked, deletes the branch on GitHub and here.
   */
  async mergePullRequest(
    session: Session,
    target: TaskTarget,
    options: { cwd: string; deleteBranch: boolean },
  ): Promise<{ pr: PullRequest; task: TaskView }> {
    const context = await this.context(session, target, options.cwd);
    const branch = this.requireBranch(context);
    const pr = await this.git.pullRequestFor(context.root, branch);
    if (!pr) throw new GitError(`${branch} has no pull request.`, { suggestions: ['Open one from the Git menu (g).'] });
    if (pr.state !== 'open') throw new GitError(`Pull request #${pr.number} is already ${pr.state}.`);
    if (pr.draft) throw new GitError(`Pull request #${pr.number} is a draft.`, { suggestions: ['Mark it ready for review on GitHub first.'] });

    // gh may switch away from the branch before deleting it; the working tree must be clean for that.
    if (options.deleteBranch && context.currentBranch === branch && (await this.git.changedFiles(context.root)).length > 0) {
      throw new GitError(`${branch} is checked out and has uncommitted changes.`, {
        code: 'dirty_worktree',
        suggestions: ['Commit them first (C), or merge without deleting the branch.'],
      });
    }
    await this.git.mergePullRequest(context.root, pr.number, { deleteBranch: options.deleteBranch });
    this.pullRequestCache.delete(context.root);
    await this.record(session, context.task, { type: 'pr_merged', metadata: { number: pr.number, url: pr.url, into: pr.base, via: 'soja' } });
    if (options.deleteBranch) {
      await this.tasks.recordGitEvent(
        session,
        context.task,
        { type: 'git_branch_deleted', metadata: { branch, merged: true } },
        { branch: null, baseBranch: null, branchStart: null },
      );
    }
    const task = await this.tasks.complete(session, context.task);
    return { pr: { ...pr, state: 'merged', mergedAt: new Date(this.now()) }, task };
  }

  /** Runs `gh auth login` in the terminal (the caller releases it first). */
  loginGitHub(): Promise<void> {
    return this.git.loginGitHub();
  }

  /** Git context for the task detail. Problems are reported, never thrown. */
  async inspect(session: Session, target: TaskTarget, cwd: string): Promise<TaskGitState> {
    try {
      const plan = await this.plan(session, target, cwd);
      if (plan.linkProject) {
        return {
          status: 'unavailable',
          reason: `${plan.linkProject.name} has no repository linked.`,
          hint: `Press b to link ${plan.root} and start, or r in Projects.`,
        };
      }
      const [own, mentions] = await Promise.all([
        plan.branchExists ? this.git.commitsOnlyOn(plan.root, plan.branch, COMMIT_LIMIT) : Promise.resolve([]),
        this.git.commitsMatching(plan.root, taskMentionPattern(plan.task.number), COMMIT_LIMIT),
      ]);
      return {
        status: 'ready',
        root: plan.root,
        branch: plan.branch,
        recorded: plan.task.branch !== null,
        branchExists: plan.branchExists,
        checkedOut: plan.checkedOut,
        currentBranch: plan.currentBranch,
        uncommitted: plan.uncommitted,
        commits: mergeCommits(own, mentions).slice(0, COMMIT_LIMIT),
      };
    } catch (error) {
      if (error instanceof SojaError) return { status: 'unavailable', reason: error.message, hint: error.hint };
      throw error;
    }
  }

  /** Repository and branch facts for operations on an already-linked task. */
  private async context(session: Session, target: TaskTarget, cwd: string): Promise<TaskContext> {
    const task = await this.tasks.get(session, target);
    const { root, linkProject } = await this.repositoryFor(session, task, cwd);
    if (linkProject) {
      throw new GitError(`${linkProject.name} has no repository linked.`, {
        suggestions: ['Press b to link it and start the task, or r in Projects.'],
      });
    }
    return { task, root, currentBranch: await this.git.currentBranch(root) };
  }

  private requireBranch(context: TaskContext): string {
    if (!context.task.branch) {
      throw new GitError(`${formatTaskRef(context.task.number)} has no branch yet.`, {
        suggestions: ['Press b (or run `soja start`) to create it.'],
      });
    }
    return context.task.branch;
  }

  private requireOnTaskBranch(context: TaskContext): void {
    const branch = this.requireBranch(context);
    if (context.currentBranch !== branch) {
      throw new GitError(`You are on ${context.currentBranch ?? 'a detached HEAD'}, not on ${branch}.`, {
        code: 'wrong_branch',
        suggestions: [`Press b to switch to ${branch} first, so the commit lands on the task.`],
      });
    }
  }

  private async requirePushable(root: string, branch: string): Promise<void> {
    if (!(await this.git.branchExists(root, branch))) {
      throw new GitError(`${branch} does not exist in this repository.`, { suggestions: ['Press b to create it again.'] });
    }
    if (!(await this.git.originUrl(root))) {
      throw new GitError('This repository has no `origin` remote.', {
        code: 'no_remote',
        suggestions: ['Add one: `git remote add origin <url>`.'],
      });
    }
  }

  private cachedPullRequests(root: string): Promise<PullRequest[]> {
    const cached = this.pullRequestCache.get(root);
    if (cached && this.now() - cached.at < PR_CACHE_MS) return cached.list;
    const list = this.git.pullRequests(root, PR_LIST_LIMIT);
    this.pullRequestCache.set(root, { at: this.now(), list });
    // A failure is not remembered: the next look tries again.
    list.catch(() => this.pullRequestCache.delete(root));
    return list;
  }

  /** Tasks with a branch, grouped by the repository they live in. Tasks without one are left out. */
  private async byRepository<T extends Task>(session: Session, cwd: string, tasks: readonly T[]): Promise<Map<string, T[]>> {
    const groups = new Map<string, T[]>();
    for (const task of tasks) {
      if (!task.branch) continue;
      const found = await this.repositoryFor(session, task, cwd).catch(() => null);
      if (!found || found.linkProject) continue;
      groups.set(found.root, [...(groups.get(found.root) ?? []), task]);
    }
    return groups;
  }

  private async recorded(session: Session, task: Task, matches: (event: ActivityEvent) => boolean): Promise<boolean> {
    const details = await this.tasks.get(session, task);
    return details.timeline.some((entry) => entry.kind === 'event' && matches(entry.event));
  }

  private async record(session: Session, task: Task, event: GitActivityEvent): Promise<void> {
    await this.tasks.recordGitEvent(session, task, event);
  }

  private async checkMerged(
    session: Session,
    task: Task & { branch: string },
    cwd: string,
  ): Promise<{ kind: 'merged'; into: string; hash: string | null } | { kind: 'deleted' } | null> {
    const { root, linkProject } = await this.repositoryFor(session, task, cwd);
    if (linkProject) return null;
    const into = task.baseBranch ?? (await this.git.defaultBranch(root));
    if (!into || into === task.branch) return null;
    const exists = await this.git.branchExists(root, task.branch);

    // A branch that still exists counts as merged only if it has work of its own
    // and all of it is in the base. A fresh branch is trivially "contained".
    if (exists && task.branchStart) {
      const own = await this.git.countCommits(root, task.branchStart, `refs/heads/${task.branch}`);
      if (own > 0 && (await this.git.isMergedInto(root, task.branch, into))) return { kind: 'merged', into, hash: null };
    }
    const commits = await this.git.recentCommits(root, into, { since: task.branchStart, limit: 300 });
    const hash = findMergeEvidence(commits, { branch: task.branch, ref: formatTaskRef(task.number) });
    if (hash) return { kind: 'merged', into, hash };
    return exists ? null : { kind: 'deleted' };
  }

  private async repositoryFor(session: Session, task: Task, cwd: string): Promise<{ root: string; linkProject: Project | null }> {
    const ref = formatTaskRef(task.number);
    const project = task.projectId ? await this.projects.get(session, task.projectId).catch(() => null) : null;

    const summary = project ? (await this.projects.list(session)).find((item) => item.id === project.id) : null;
    const cwdRoot = await this.git.repositoryRoot(cwd);
    const currentRepository = summary?.repositories.find((item) => item.localPath && cwdRoot === item.localPath);
    const selectedRepository = task.repositoryId
      ? summary?.repositories.find((item) => item.id === task.repositoryId)
      : currentRepository ?? summary?.repositories.find((item) => item.name === 'default');
    if (task.repositoryId && !selectedRepository) throw new GitError('The task repository is unavailable in this workspace.', { hint: 'Refresh the workspace data or select another repository on the task.' });
    const selectedPath = selectedRepository?.localPath ?? (task.repositoryId ? null : project?.repositoryPath);
    if (selectedPath) {
      const path = selectedPath;
      if (!project) throw new GitError(`${ref} refers to a missing project.`);
      const relink = { hint: `Relink it: soja project link ${project.key} <path>` };
      if (!existsSync(path)) throw new GitError(`${project.name}'s repository is gone: ${path}`, relink);
      const root = await this.git.repositoryRoot(path);
      if (!root) throw new GitError(`${path} is no longer a Git repository.`, relink);
      return { root, linkProject: null };
    }

    if (selectedRepository && !selectedRepository.localPath) {
      throw new GitError(`Repository “${selectedRepository.name}” has no local folder linked on this machine.`, {
        hint: selectedRepository.name === 'default'
          ? `Run \`soja project link ${project?.key} <path>\` first.`
          : `Run \`soja project repo link ${project?.key} ${selectedRepository.name} <path>\` first.`,
      });
    }

    if (project) {
      if (!cwdRoot) {
        throw new GitError(`${project.name} has no repository linked.`, {
          hint: `Run \`soja project link ${project.key} <path>\`, or start from inside its repository.`,
        });
      }
      return { root: cwdRoot, linkProject: project };
    }
    if (!cwdRoot) {
      throw new GitError(`${ref} has no project and this directory is not a Git repository.`, {
        hint: `Run it inside a repository, or use \`soja task start ${ref}\` to start without Git.`,
      });
    }
    return { root: cwdRoot, linkProject: null };
  }
}

function mergeCommits(...lists: GitCommit[][]): GitCommit[] {
  const byHash = new Map<string, GitCommit>();
  for (const commit of lists.flat()) byHash.set(commit.hash, commit);
  return [...byHash.values()].sort((a, b) => b.date.getTime() - a.date.getTime());
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}
