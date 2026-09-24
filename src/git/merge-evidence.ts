export interface LoggedCommit {
  hash: string;
  parents: string[];
  message: string;
}

/**
 * Finds the commit in a base branch that shows `branch` was merged into it,
 * even after the branch was deleted:
 *  - a merge commit naming the branch or the task ("Merge branch 'fix/SOJA-12-…'",
 *    "Merge pull request #5 from you/fix/SOJA-12-…", "Merge SOJA-12: …"), or
 *  - a GitHub squash merge ("… (SOJA-12) (#5)"), which SOJA's PR titles produce.
 * Plain commits that merely mention the task on the base branch do not count.
 */
export function findMergeEvidence(commits: readonly LoggedCommit[], target: { branch: string; ref: string }): string | null {
  const mentionsTask = new RegExp(`${escapeRegex(target.ref)}([^0-9]|$)`, 'i');
  for (const commit of commits) {
    const isMerge = commit.parents.length > 1;
    if (isMerge && (commit.message.includes(target.branch) || mentionsTask.test(commit.message))) return commit.hash;
    const subject = commit.message.split('\n')[0] ?? '';
    if (!isMerge && /\(#\d+\)\s*$/.test(subject) && mentionsTask.test(subject)) return commit.hash;
  }
  return null;
}

function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
