import { Box, Text } from 'ink';
import { useState } from 'react';
import type { TimelineEntry } from '../../application/types.js';
import { TYPE_LABELS } from '../../domain/task.js';
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
  const { services, session } = useAppState();
  const { width, height } = useLayout();
  const actions = useTaskActions();
  const [scroll, setScroll] = useState(0);
  const query = useQuery(() => services.tasks.get(session, taskRef), `task:${session.workspace.id}:${taskRef}`);
  const task = query.data;

  // Everything above the timeline, measured in rows, so the timeline gets the rest.
  const titleLines = task ? wrapText(task.title, width).length : 1;
  const descriptionLines = task?.description ? clampLines(wrapText(task.description, width - 2), Math.max(1, Math.min(6, height - 18))) : [];
  const fixedRows = 1 + titleLines + 1 + 1 + 4 + 1 + Math.max(1, descriptionLines.length) + 1 + 1;
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
        <Field label="Branch" value={task.branch ?? undefined} hint={task.branch ? undefined : task.suggestedBranch} />
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
