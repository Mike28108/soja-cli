import { SojaError } from '../domain/errors.js';
import type { LoggedCommit } from './merge-evidence.js';

export interface GitCommit {
  hash: string;
  shortHash: string;
  subject: string;
  author: string;
  date: Date;
}

/**
 * The few local Git operations SOJA needs. Everything is offline: no fetch,
 * no push, no remote API. `root` is always a repository top-level directory.
 */
export interface GitClient {
  /** Top-level directory of the repository containing `path`, or null when it is not in one. */
  repositoryRoot(path: string): Promise<string | null>;
  /** Checked-out branch, or null on a detached HEAD. */
  currentBranch(root: string): Promise<string | null>;
  branchExists(root: string, branch: string): Promise<boolean>;
  isValidBranchName(root: string, branch: string): Promise<boolean>;
  /** Number of changed, staged or untracked paths. */
  uncommittedChanges(root: string): Promise<number>;
  /** Creates `branch` from `from` (HEAD by default) and checks it out. */
  createBranch(root: string, branch: string, from?: string): Promise<void>;
  switchBranch(root: string, branch: string): Promise<void>;
  /** Commits that exist only on `branch` (not reachable from any other local branch), newest first. */
  commitsOnlyOn(root: string, branch: string, limit: number): Promise<GitCommit[]>;
  /** Commits on any local branch whose message matches the extended regex `pattern`. */
  commitsMatching(root: string, pattern: string, limit: number): Promise<GitCommit[]>;
  /** URL of the `origin` remote from local config, if any. */
  originUrl(root: string): Promise<string | null>;

  // ── Operations that change the repository. They stream to the console. ──

  /** Working tree changes, like `git status`. */
  changedFiles(root: string): Promise<ChangedFile[]>;
  /**
   * Stages exactly `files` (new, modified, deleted, renamed) and commits only
   * them, leaving anything else that was staged alone. Returns the new hash.
   */
  commit(root: string, message: string, files: readonly Pick<ChangedFile, 'path' | 'previousPath'>[]): Promise<string>;
  /** Checks out `into` and merges `branch` with a merge commit (`--no-ff`). Returns the merge hash. */
  merge(root: string, branch: string, into: string, message: string): Promise<string>;
  isMerging(root: string): Promise<boolean>;
  abortMerge(root: string): Promise<void>;
  /** True when every commit of `branch` is already in `into`. */
  isMergedInto(root: string, branch: string, into: string): Promise<boolean>;
  deleteBranch(root: string, branch: string, force: boolean): Promise<void>;
  /** Full hash of `ref`, or null if it does not resolve. */
  resolveCommit(root: string, ref: string): Promise<string | null>;
  /** Commits in `to` that are not in `from` (0 when either is unknown). */
  countCommits(root: string, from: string, to: string): Promise<number>;
  /** Recent commits of `branch` (optionally only after `since`), with parents and full message. */
  recentCommits(root: string, branch: string, options: { since?: string | null; limit: number }): Promise<LoggedCommit[]>;
  /** The branch `origin/HEAD` points to, else `main` or `master` if they exist. */
  defaultBranch(root: string): Promise<string | null>;
  /** Pushes `branch` to origin and sets it as upstream. */
  push(root: string, branch: string, options?: RemoteOptions): Promise<void>;
  /** Opens a pull request with the GitHub CLI and returns its URL. */
  createPullRequest(
    root: string,
    request: { base: string; head: string; title: string; body: string },
    options?: RemoteOptions,
  ): Promise<string>;
  /** Runs `gh auth login` attached to the terminal. */
  loginGitHub(): Promise<void>;

  // ── GitHub pull requests, through the GitHub CLI (v0.6). ──

  /** The newest pull request whose head is `branch`, or null when there is none. */
  pullRequestFor(root: string, branch: string): Promise<PullRequest | null>;
  /** Recent pull requests of the repository (open, merged and closed), newest first. */
  pullRequests(root: string, limit: number): Promise<PullRequest[]>;
  /** Merges the pull request on GitHub with a merge commit; optionally deletes its branch (remote and local). */
  mergePullRequest(root: string, number: number, options: { deleteBranch: boolean }): Promise<void>;
}

export type PullRequestState = 'open' | 'merged' | 'closed';
export type ReviewState = 'approved' | 'changes_requested' | 'review_required' | null;

/** CI on the pull request's latest commit. */
export interface CheckSummary {
  total: number;
  passed: number;
  failed: number;
  pending: number;
  /** Names of the failing checks. */
  failing: string[];
}

export interface PullRequest {
  number: number;
  url: string;
  title: string;
  state: PullRequestState;
  draft: boolean;
  base: string;
  head: string;
  /** Latest commit of the head branch. */
  headSha: string;
  review: ReviewState;
  /** Whether GitHub can merge it as is (`unknown` while GitHub computes it). */
  mergeable: 'mergeable' | 'conflicting' | 'unknown';
  checks: CheckSummary;
  mergedAt: Date | null;
}

export type ChangeKind = 'modified' | 'added' | 'deleted' | 'renamed' | 'copied' | 'untracked' | 'conflicted' | 'typechange';

export interface ChangedFile {
  path: string;
  /** Original path of a rename or copy. */
  previousPath?: string;
  kind: ChangeKind;
  /** Has changes already in the index. */
  staged: boolean;
}

export type GitErrorCode =
  | 'not_installed'
  | 'gh_missing'
  | 'gh_auth'
  | 'auth_required'
  | 'merge_conflict'
  | 'not_merged'
  | 'nothing_to_commit'
  | 'dirty_worktree'
  | 'identity_unknown'
  | 'rejected'
  | 'offline'
  | 'no_remote'
  | 'pr_exists'
  | 'not_github'
  | 'blocked'
  | 'wrong_branch'
  | 'failed';

/** Options for commands that talk to a remote. */
export interface RemoteOptions {
  /**
   * Run attached to the terminal so Git/ssh/gh can ask for credentials.
   * The caller must have released the terminal (the TUI suspends itself).
   */
  interactive?: boolean;
}

/**
 * A Git (or gh) command failed or is unavailable. `message` is safe to show;
 * `code` lets interfaces offer a follow-up (force delete, abort merge,
 * retry interactively); `suggestions` are next steps in plain words.
 */
export class GitError extends SojaError {
  readonly code: GitErrorCode;
  readonly suggestions: readonly string[];

  constructor(
    message: string,
    options: { code?: GitErrorCode; suggestions?: readonly string[]; hint?: string; cause?: unknown } = {},
  ) {
    const suggestions = options.suggestions ?? (options.hint ? [options.hint] : []);
    super(message, { hint: options.hint ?? suggestions[0], cause: options.cause });
    this.code = options.code ?? 'failed';
    this.suggestions = suggestions;
  }
}
