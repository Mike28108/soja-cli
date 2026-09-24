import { Box, Text } from 'ink';
import { useEffect, useState } from 'react';
import type { TaskGitState } from '../../application/services/index.js';
import type { TimelineEntry } from '../../application/types.js';
import { isClosed, TYPE_LABELS } from '../../domain/task.js';
import { formatRelative, formatStamp } from '../../utils/time.js';
import { clampLines, wrapText } from '../../utils/text.js';
import { useAppState } from '../app-state.js';
import { EmptyState } from '../components/EmptyState.js';
import { PriorityLabel, StatusLabel } from '../components/Labels.js';
import { useLayout } from '../hooks/use-layout.js';
import { useQuery } from '../hooks/use-query.js';
import { useTaskActions } from '../hooks/use-task-actions.js';
import { Layer } from '../input/dispatcher.js';
import { useKeys } from '../input/KeyProvider.js';
import { palette, symbols } from '../theme/theme.js';
import { ScreenFrame } from './ScreenFrame.js';

const LABEL_WIDTH = 14;

export function TaskScreen({ active, taskRef }: { active: boolean; taskRef: string }) {
  const { services, session, cwd, detectMerges } = useAppState();
  useEffect(() => {
    void detectMerges(taskRef);
  }, [detectMerges, taskRef]);
  const { width, height } = useLayout();
  const actions = useTaskActions();
  const [scroll, setScroll] = useState(0);
  const query = useQuery(() => services.tasks.get(session, taskRef), `task:${session.workspace.id}:${taskRef}`);
  const task = query.data;
  // Git state loads on its own so the task shows instantly even in big repositories.
  const git = useQuery(() => services.git.inspect(session, taskRef, cwd), `git:${session.workspace.id}:${taskRef}`);

  // Everything above the timeline, measured in rows, so the timeline gets the rest.
  const titleLines = task ? wrapText(task.title, width).length : 1;
  const descriptionLines = task?.description ? clampLines(wrapText(task.description, width - 2), Math.max(1, Math.min(6, height - 18))) : [];
  const fixedRows = 1 + titleLines + 1 + 1 + 5 + 1 + Math.max(1, descriptionLines.length) + 1 + 1;
  const timelineRows = Math.max(2, height - fixedRows);
  const timeline = task ? timelineLines(task.timeline, width) : [];
  const actorWidth = Math.min(18, Math.max(8, ...timeline.map((line) => line.actor.length)) + 2);
  const maxScroll = Math.max(0, timeline.length - timelineRows);
  const offset = Math.min(scroll, maxScroll);

  useKeys(
    Layer.screen,
    (input, key) => {
      if (!task || key.ctrl || key.meta) return false;
      const bindings: Record<string, () => unknown> = {
        s: () => actions.status(task),
        p: () => actions.priority(task),
        a: () => actions.assign(task),
        t: () => actions.type(task),
        m: () => actions.project(task),
        r: () => actions.requester(task),
        d: () => actions.description(task),
        c: () => actions.comment(task),
        e: () => actions.edit(task),
        x: () => actions.toggleDone(task),
        b: () => actions.branch(task),
        g: () => actions.gitMenu(task),
        C: () => actions.commit(task),
      };
      const action = bindings[input];
      if (action) void action();
      // Timeline scrolls from the newest entries (bottom) upwards.
      else if (input === 'k' || key.upArrow) setScroll(Math.min(maxScroll, offset + 1));
      else if (input === 'j' || key.downArrow) setScroll(Math.max(0, offset - 1));
      else return false;
      return true;
    },
    active,
  );

  const hints = [
    ['s', 'status'],
    ['p', 'priority'],
    ['a', 'assign'],
    ['c', 'comment'],
    ['e', 'edit'],
    ['g', 'git'],
    ['x', task?.status === 'done' ? 'reopen' : 'done'],
    ['esc', 'back'],
  ] as const;

  if (!task) {
    return (
      <ScreenFrame hints={[['esc', 'back']]}>
        {query.error ? <EmptyState lines={[query.error.message, query.error.hint ?? '']} /> : <Text dimColor>Loading…</Text>}
      </ScreenFrame>
    );
  }

  const end = timeline.length - offset;
  const visibleTimeline = timeline.slice(Math.max(0, end - timelineRows), end);
  return (
    <ScreenFrame hints={hints}>
      <Box justifyContent="space-between">
        <Text>
          <Text bold color={palette.accent}>
            {task.ref}
          </Text>
          <Text dimColor>{`  ${TYPE_LABELS[task.type]}`}</Text>
        </Text>
        {width >= 70 ? (
          <Text dimColor>
            {`created ${formatStamp(task.createdAt)}${task.creator ? ` by @${task.creator.username}` : ''} ${symbols.dot} updated ${formatRelative(task.updatedAt)}`}
          </Text>
        ) : null}
      </Box>
      <Text bold>{task.title}</Text>
      <Box gap={3}>
        <StatusLabel status={task.status} />
        <PriorityLabel priority={task.priority} />
      </Box>

      <Box marginTop={1} flexDirection="column">
        <Field label="Project" value={task.project?.name} />
        <Field label="Assignee" value={task.assignee ? `@${task.assignee.username}` : undefined} hint={task.assignee?.displayName} />
        <Field label="Requested by" value={task.requester ?? undefined} />
        <GitFields state={git.data} fallbackBranch={task.branch ?? task.suggestedBranch} recorded={task.branch !== null} closed={isClosed(task.status)} />
      </Box>

      <Box marginTop={1} flexDirection="column" paddingLeft={2}>
        {descriptionLines.length ? (
          descriptionLines.map((line, index) => <Text key={index}>{line}</Text>)
        ) : (
          <Text dimColor>No description. Press d to add one.</Text>
        )}
      </Box>

      <Box marginTop={1} justifyContent="space-between">
        <Text dimColor bold>
          ACTIVITY
        </Text>
        {maxScroll > 0 ? <Text dimColor>{offset > 0 ? 'j newer' : 'k older'}</Text> : null}
      </Box>
      {visibleTimeline.map((line) => (
        <Text key={line.key} wrap="truncate-end">
          <Text dimColor>{line.stamp.padEnd(7)}</Text>
          <Text dimColor={!line.actor}>{line.actor.padEnd(actorWidth)}</Text>
          {line.kind === 'comment' ? <Text color={palette.accent}>{line.first ? `${symbols.comment} ` : '  '}</Text> : null}
          <Text dimColor={line.kind === 'event'}>{line.text}</Text>
        </Text>
      ))}
    </ScreenFrame>
  );
}

function Field({ label, value, hint }: { label: string; value: string | undefined; hint?: string | undefined }) {
  return (
    <Box>
      <Box width={LABEL_WIDTH} flexShrink={0}>
        <Text dimColor>{label}</Text>
      </Box>
      <Text wrap="truncate-end">
        {value ? <Text>{value}</Text> : <Text dimColor>—</Text>}
        {hint ? <Text dimColor>{value ? `  ${hint}` : `  suggested ${hint}`}</Text> : null}
      </Text>
    </Box>
  );
}

/** Branch and commits rows. Two rows always, so the layout does not jump while Git loads. */
function GitFields({
  state,
  fallbackBranch,
  recorded,
  closed,
}: {
  state: TaskGitState | undefined;
  fallbackBranch: string;
  recorded: boolean;
  closed: boolean;
}) {
  if (!state) {
    return (
      <>
        <Field label="Branch" value={recorded ? fallbackBranch : undefined} hint={recorded ? undefined : fallbackBranch} />
        <Field label="Commits" value={undefined} />
      </>
    );
  }
  if (state.status === 'unavailable') {
    return (
      <>
        <Field label="Branch" value={recorded ? fallbackBranch : undefined} hint={recorded ? undefined : fallbackBranch} />
        <Box>
          <Box width={LABEL_WIDTH} flexShrink={0}>
            <Text dimColor>Git</Text>
          </Box>
          <Text dimColor wrap="truncate-end">
            {state.reason}
          </Text>
        </Box>
      </>
    );
  }

  const [latest] = state.commits;
  return (
    <>
      <Box>
        <Box width={LABEL_WIDTH} flexShrink={0}>
          <Text dimColor>Branch</Text>
        </Box>
        <Text wrap="truncate-end">
          <Text dimColor={!state.branchExists}>{closed && !state.recorded && !state.branchExists ? '—' : state.branch}</Text>
          {state.checkedOut ? (
            <Text color={palette.success}>{`  ${symbols.active} checked out`}</Text>
          ) : state.branchExists ? (
            <Text dimColor>{'  not checked out'}</Text>
          ) : state.recorded && !closed ? (
            <Text color={palette.warning}>{'  deleted, no merge found · b recreate · g forget'}</Text>
          ) : state.recorded ? (
            <Text dimColor>{'  deleted'}</Text>
          ) : closed ? null : (
            <Text dimColor>{'  suggested · b to start'}</Text>
          )}
          {state.uncommitted > 0 ? <Text color={palette.warning}>{`  ${state.uncommitted} uncommitted`}</Text> : null}
        </Text>
      </Box>
      <Box>
        <Box width={LABEL_WIDTH} flexShrink={0}>
          <Text dimColor>Commits</Text>
        </Box>
        {latest ? (
          <Text wrap="truncate-end">
            <Text color={palette.warning}>{latest.shortHash}</Text>
            <Text>{` ${latest.subject}`}</Text>
            <Text dimColor>{`  ${formatRelative(latest.date)}${state.commits.length > 1 ? `  +${state.commits.length - 1} more` : ''}`}</Text>
          </Text>
        ) : (
          <Text dimColor>none yet</Text>
        )}
      </Box>
    </>
  );
}

interface TimelineLine {
  key: string;
  kind: TimelineEntry['kind'];
  stamp: string;
  actor: string;
  text: string;
  /** False for the wrapped continuation lines of a comment. */
  first: boolean;
}

/** Flattens the timeline into display rows; comments wrap to at most three lines. */
function timelineLines(entries: readonly TimelineEntry[], width: number): TimelineLine[] {
  const textWidth = Math.max(10, width - 7 - 18 - 2);
  const now = new Date();
  return entries.flatMap((entry): TimelineLine[] => {
    const stamp = formatStamp(entry.at, now);
    const actor = entry.actor ? `@${entry.actor.username}` : '';
    if (entry.kind === 'event') return [{ key: entry.id, kind: entry.kind, stamp, actor, text: entry.text, first: true }];
    return clampLines(wrapText(entry.body, textWidth), 3).map((text, index) => ({
      key: `${entry.id}:${index}`,
      kind: entry.kind,
      stamp: index === 0 ? stamp : '',
      actor: index === 0 ? actor : '',
      text,
      first: index === 0,
    }));
  });
}
