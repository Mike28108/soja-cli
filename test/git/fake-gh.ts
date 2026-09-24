import { chmodSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A stand-in for the GitHub CLI: answers `pr list` and `pr merge` from a
 * JSON file, in gh's own output format, and logs every call.
 */
const SCRIPT = `#!/usr/bin/env node
const { readFileSync, writeFileSync, appendFileSync } = require('node:fs');
const { execFileSync } = require('node:child_process');
const file = process.env.FAKE_GH_STATE;
const state = JSON.parse(readFileSync(file, 'utf8'));
const args = process.argv.slice(2);
appendFileSync(file + '.log', args.join(' ') + '\\n');
if (state.fail) { process.stderr.write(state.fail); process.exit(1); }
const flag = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
if (args[0] === 'pr' && args[1] === 'list') {
  const head = flag('--head');
  const limit = Number(flag('--limit') || 30);
  const rows = state.prs.filter((pr) => !head || pr.headRefName === head).slice(0, limit);
  process.stdout.write(JSON.stringify(rows));
} else if (args[0] === 'pr' && args[1] === 'merge') {
  if (state.mergeFail) { process.stderr.write(state.mergeFail); process.exit(1); }
  const pr = state.prs.find((candidate) => candidate.number === Number(args[2]));
  pr.state = 'MERGED';
  pr.mergedAt = new Date().toISOString();
  if (args.includes('--delete-branch')) {
    const current = execFileSync('git', ['symbolic-ref', '--short', 'HEAD'], { encoding: 'utf8' }).trim();
    if (current === pr.headRefName) execFileSync('git', ['switch', '--quiet', pr.baseRefName]);
    execFileSync('git', ['branch', '-D', pr.headRefName]);
  }
  writeFileSync(file, JSON.stringify(state));
  process.stdout.write('✓ Merged pull request #' + pr.number + '\\n');
} else { process.stderr.write('unknown command'); process.exit(1); }
`;


export interface FakeGh {
  /** Path to pass as `binaries.gh`. */
  gh: string;
  stateFile: string;
  write(state: object): void;
  calls(): string[];
}

/** Installs the fake in `dir` and points it at a state file there (via FAKE_GH_STATE). */
export function installFakeGh(dir: string): FakeGh {
  const gh = join(dir, 'gh');
  writeFileSync(gh, SCRIPT);
  chmodSync(gh, 0o755);
  const stateFile = join(dir, 'gh-state.json');
  process.env.FAKE_GH_STATE = stateFile;
  const write = (state: object) => writeFileSync(stateFile, JSON.stringify(state));
  write({ prs: [] });
  return {
    gh,
    stateFile,
    write,
    calls() {
      try {
        return readFileSync(`${stateFile}.log`, 'utf8').trim().split('\n').filter(Boolean);
      } catch {
        return [];
      }
    },
  };
}

/** A pull request as `gh pr list --json` prints it. */
export function ghPr(branch: string, overrides: Record<string, unknown> = {}) {
  return {
    number: 12,
    url: 'https://github.com/bravos/enrollbridge/pull/12',
    title: 'Webhook dedupe (SOJA-1)',
    state: 'OPEN',
    isDraft: false,
    baseRefName: 'main',
    headRefName: branch,
    headRefOid: 'aaaaaaa1111111',
    reviewDecision: 'REVIEW_REQUIRED',
    mergeable: 'MERGEABLE',
    statusCheckRollup: [
      { __typename: 'CheckRun', name: 'build', status: 'COMPLETED', conclusion: 'SUCCESS' },
      { __typename: 'CheckRun', name: 'lint', status: 'COMPLETED', conclusion: 'FAILURE' },
    ],
    mergedAt: null,
    ...overrides,
  };
}

