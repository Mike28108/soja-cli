import { describe, expect, it } from 'vitest';
import { parseStatus } from '../../src/git/cli-git.js';
import { diagnose } from '../../src/git/diagnose.js';

describe('diagnose', () => {
  const cases: [string, string][] = [
    ['CONFLICT (content): Merge conflict in README.md\nAutomatic merge failed; fix conflicts', 'merge_conflict'],
    ["error: the branch 'x' is not fully merged", 'not_merged'],
    ['fatal: could not read Username for https://github.com: terminal prompts disabled', 'auth_required'],
    ['git@github.com: Permission denied (publickey).', 'auth_required'],
    ['fatal: unable to access https://github.com/x: Could not resolve host: github.com', 'offline'],
    [' ! [rejected]        main -> main (fetch first)', 'rejected'],
    ["fatal: 'origin' does not appear to be a git repository", 'no_remote'],
    ['Author identity unknown\n*** Please tell me who you are.', 'identity_unknown'],
    ['error: Your local changes to the following files would be overwritten by checkout', 'dirty_worktree'],
    ['a pull request for branch "fix/x" into branch "main" already exists:\nhttps://github.com/o/r/pull/3', 'pr_exists'],
    ['To get started with GitHub CLI, please run:  gh auth login', 'gh_auth'],
  ];

  it.each(cases)('recognizes %s', (output, code) => {
    const found = diagnose(output, 'Failed.');
    expect(found.code).toBe(code);
    expect(found.suggestions.length).toBeGreaterThan(0);
  });

  it('extracts the existing pull request URL', () => {
    expect(diagnose(cases[9]?.[0] ?? '', 'x').suggestions).toEqual(['https://github.com/o/r/pull/3']);
  });

  it('falls back to the first meaningful line', () => {
    expect(diagnose('hint: ignore me\nfatal: something odd happened', 'Could not push.')).toMatchObject({
      code: 'failed',
      message: 'Could not push. Something odd happened',
    });
  });
});

describe('parseStatus', () => {
  it('reads porcelain -z output, including renames and conflicts', () => {
    const output = [' M src/a.ts', 'A  new.ts', 'R  renamed.ts', 'original.ts', 'UU both.ts', '?? untracked.txt', ' D gone.ts', ''].join('\0');
    expect(parseStatus(output)).toEqual([
      { path: 'src/a.ts', kind: 'modified', staged: false },
      { path: 'new.ts', kind: 'added', staged: true },
      { path: 'renamed.ts', previousPath: 'original.ts', kind: 'renamed', staged: true },
      { path: 'both.ts', kind: 'conflicted', staged: true },
      { path: 'untracked.txt', kind: 'untracked', staged: false },
      { path: 'gone.ts', kind: 'deleted', staged: false },
    ]);
  });
});
