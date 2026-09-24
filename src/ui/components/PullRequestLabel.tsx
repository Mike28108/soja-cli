import { Text } from 'ink';
import type { PullRequest } from '../../git/types.js';
import { palette, symbols } from '../theme/theme.js';

/** `#12✓`: number plus the one thing that matters most right now. For lists. */
export function PullRequestMark({ pr }: { pr: PullRequest }) {
  const mark = prMark(pr);
  return (
    <Text color={mark.color} dimColor={mark.dim}>
      {`${symbols.pullRequest}${pr.number}${mark.glyph} `}
    </Text>
  );
}

function prMark(pr: PullRequest): { glyph: string; color?: string; dim?: boolean } {
  if (pr.state === 'merged') return { glyph: symbols.check, color: palette.merged };
  if (pr.state === 'closed') return { glyph: symbols.cross, dim: true };
  if (pr.checks.failed > 0 || pr.mergeable === 'conflicting' || pr.review === 'changes_requested') return { glyph: symbols.cross, color: palette.danger };
  if (pr.checks.pending > 0) return { glyph: symbols.running, color: palette.warning };
  if (pr.review === 'approved') return { glyph: symbols.check, color: palette.success };
  return { glyph: '', color: palette.info };
}

/** The full line for the task detail: state, review, checks, conflicts. */
export function PullRequestSummary({ pr }: { pr: PullRequest }) {
  const stateColor = pr.state === 'merged' ? palette.merged : pr.state === 'open' ? palette.info : undefined;
  const { checks } = pr;
  return (
    <Text wrap="truncate-end">
      <Text color={stateColor} dimColor={pr.state === 'closed'}>{`${symbols.pullRequest}${pr.number} ${pr.draft ? 'draft' : pr.state}`}</Text>
      <Text dimColor>{` → ${pr.base}`}</Text>
      {pr.state === 'open' && pr.review ? (
        <Text color={pr.review === 'approved' ? palette.success : pr.review === 'changes_requested' ? palette.danger : undefined} dimColor={pr.review === 'review_required'}>
          {`  ${pr.review === 'approved' ? `${symbols.check} approved` : pr.review === 'changes_requested' ? `${symbols.cross} changes requested` : 'review required'}`}
        </Text>
      ) : null}
      {pr.state === 'open' && checks.total > 0 ? (
        checks.failed > 0 ? (
          <Text color={palette.danger}>{`  ${symbols.cross} ${checks.failed} failing: ${checks.failing.join(', ')}`}</Text>
        ) : checks.pending > 0 ? (
          <Text color={palette.warning}>{`  ${symbols.running} checks ${checks.passed}/${checks.total}, ${checks.pending} running`}</Text>
        ) : (
          <Text color={palette.success}>{`  ${symbols.check} checks ${checks.passed}/${checks.total}`}</Text>
        )
      ) : null}
      {pr.state === 'open' && pr.mergeable === 'conflicting' ? <Text color={palette.danger}>{'  conflicts with base'}</Text> : null}
    </Text>
  );
}
