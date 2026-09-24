import type { GitErrorCode } from './types.js';

export interface Diagnosis {
  code: GitErrorCode;
  message: string;
  suggestions: string[];
}

interface Rule {
  test: RegExp;
  diagnose: (output: string) => Diagnosis;
}

const RULES: Rule[] = [
  {
    test: /CONFLICT|Automatic merge failed|fix conflicts/i,
    diagnose: () => ({
      code: 'merge_conflict',
      message: 'The merge has conflicts.',
      suggestions: [
        'Resolve the conflicted files in your editor, then `git add` them and `git commit`.',
        'Or abort the merge to go back to how things were (SOJA: a, or `git merge --abort`).',
      ],
    }),
  },
  {
    test: /not fully merged/i,
    diagnose: () => ({
      code: 'not_merged',
      message: 'The branch has commits that are not merged anywhere.',
      suggestions: ['Merge it first, or confirm deleting it anyway (those commits will be lost).'],
    }),
  },
  {
    test: /nothing to commit|no changes added to commit|nothing added to commit/i,
    diagnose: () => ({ code: 'nothing_to_commit', message: 'There is nothing to commit.', suggestions: ['Change some files first.'] }),
  },
  {
    test: /would be overwritten|commit your changes or stash them|Please commit or stash/i,
    diagnose: () => ({
      code: 'dirty_worktree',
      message: 'You have uncommitted changes that Git would overwrite.',
      suggestions: ['Commit them from SOJA (C), or run `git stash` and try again.'],
    }),
  },
  {
    test: /Please tell me who you are|Author identity unknown|empty ident name/i,
    diagnose: () => ({
      code: 'identity_unknown',
      message: 'Git does not know who you are.',
      suggestions: ['git config --global user.name "Your Name"', 'git config --global user.email "you@example.com"'],
    }),
  },
  {
    test: /Authentication failed|could not read Username|terminal prompts disabled|Permission denied \(publickey|Host key verification failed|invalid username or password|returned error: 403/i,
    diagnose: () => ({
      code: 'auth_required',
      message: 'Git needs your credentials for the remote.',
      suggestions: [
        'Retry interactively: SOJA pauses so Git can ask for them (i).',
        'Or set up an SSH key or a credential helper, e.g. `gh auth setup-git`.',
      ],
    }),
  },
  {
    test: /Could not resolve host|unable to access|Network is unreachable|Connection timed out|Connection refused|Could not read from remote repository/i,
    diagnose: () => ({
      code: 'offline',
      message: 'Could not reach the remote.',
      suggestions: ['Check your connection. Commit, merge and branches keep working offline.'],
    }),
  },
  {
    test: /\[rejected\]|non-fast-forward|fetch first|failed to push some refs/i,
    diagnose: () => ({
      code: 'rejected',
      message: 'The remote has commits you do not have.',
      suggestions: ['Run `git pull --rebase` on this branch, then push again.'],
    }),
  },
  {
    test: /'origin' does not appear to be a git repository|No such remote|No configured push destination/i,
    diagnose: () => ({
      code: 'no_remote',
      message: 'This repository has no `origin` remote.',
      suggestions: ['Add one: `git remote add origin <url>`.'],
    }),
  },
  {
    test: /a pull request for branch .* already exists/i,
    diagnose: (output) => ({
      code: 'pr_exists',
      message: 'A pull request for this branch already exists.',
      suggestions: [output.match(/https?:\/\/\S+/)?.[0] ?? 'See it with `gh pr view --web`.'],
    }),
  },
  {
    test: /gh auth login|not logged in|authentication token|HTTP 401/i,
    diagnose: () => ({
      code: 'gh_auth',
      message: 'The GitHub CLI is not logged in.',
      suggestions: ['Log in now: SOJA pauses and runs `gh auth login` (i).'],
    }),
  },
];

/** Turns Git's (or gh's) output into a friendly message and next steps. */
export function diagnose(output: string, fallback: string): Diagnosis {
  for (const rule of RULES) if (rule.test.test(output)) return rule.diagnose(output);
  const line = output
    .split('\n')
    .map((text) => text.trim())
    .find((text) => text && !text.startsWith('hint:'));
  const detail = line?.replace(/^(fatal|error):\s*/i, '');
  return {
    code: 'failed',
    message: detail ? `${fallback} ${capitalize(detail)}` : fallback,
    suggestions: ['See the Git log above for the full output.'],
  };
}

function capitalize(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
