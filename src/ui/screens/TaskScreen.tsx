import { Box, Text } from 'ink';
import { useEffect, useState, type ReactNode } from 'react';
import type { TaskGitState, TaskPullRequestState } from '../../application/services/index.js';
import { PullRequestSummary } from '../components/PullRequestLabel.js';
import type { TimelineEntry } from '../../application/types.js';
import { isClosed, isProvisional, TYPE_LABELS } from '../../domain/task.js';
import { formatRelative, formatStamp } from '../../utils/time.js';
import { clampLines, wrapText } from '../../utils/text.js';
import { useAppState } from '../app-state.js';
import { EmptyState } from '../components/EmptyState.js';
import { PriorityMeter, StatusBadge } from '../components/Labels.js';
import { Badge } from '../kit/Badge.js';
import { Clickable } from '../kit/Clickable.js';
import { Panel } from '../kit/Panel.js';
import { Spinner } from '../kit/Spinner.js';
import { useLayout } from '../hooks/use-layout.js';
import { useQuery } from '../hooks/use-query.js';
import { useTaskActions } from '../hooks/use-task-actions.js';
import { Layer } from '../input/dispatcher.js';
import { useKeys } from '../input/KeyProvider.js';
import { palette, symbols } from '../theme/theme.js';
import { ScreenFrame } from './ScreenFrame.js';
import { Mascot } from '../mascot/Mascot.js';
import { sceneForTask } from '../mascot/selection.js';

const LABEL_WIDTH = 14;

export function TaskScreen({ active, taskRef }: { active: boolean; taskRef: string }) {
  const { services, session, cwd, detectMerges, followPullRequests, openOverlay, run, syncStatus } = useAppState();
  useEffect(() => {
    void detectMerges(taskRef);
    void followPullRequests(taskRef);
  }, [detectMerges, followPullRequests, taskRef]);
  const { width, height } = useLayout();
  const actions = useTaskActions();
  const [scroll, setScroll] = useState(0);
  const [taskTarget, setTaskTarget] = useState<{ id: string; number: number } | null>(null);
  const taskTopic = `task:${session.workspace.id}:${taskRef}`;
  const query = useQuery(
    () => services.tasks.get(session, taskTarget ?? taskRef),
    `${taskTopic}:${taskTarget?.id ?? ''}`,
    [taskTopic],
  );
  if (query.data && query.data.id !== taskTarget?.id) {
    setTaskTarget({ id: query.data.id, number: query.data.number });
  }
  const task = query.data;
  // Remote mode: conflicts and rejections the last syncs reported for this task.
  const notices = useQuery(
    async () => (services.sync && query.data ? services.sync.notices(session.workspace.id, query.data.id) : []),
    `notices:${taskRef}:${query.data?.id ?? ''}`,
    [taskTopic],
  );
  const openNotices = () => {
    const sync = services.sync;
    const list = notices.data ?? [];
    if (!sync || list.length === 0 || !task) return;
    openOverlay({
      kind: 'picker',
      title: 'Sync notices',
      context: task.ref,
      options: list.flatMap((notice) => [
        ...(notice.kind === 'conflict' && notice.field
          ? [{ value: `restore:${notice.id}`, label: `Restore ${notice.field} to ${JSON.stringify(notice.overwritten)}`, hint: 'their value' }]
          : []),
        { value: `dismiss:${notice.id}`, label: `Dismiss: ${notice.message}`, dim: true },
      ]),
      onSelect: (value) => {
        const [action, id] = value.split(':');
        const notice = list.find((candidate) => candidate.id === id);
        if (!notice) return;
        return run(async () => {
          if (action === 'restore' && notice.field) {
            await services.tasks.update(session, task, { [notice.field]: notice.overwritten } as Parameters<typeof services.tasks.update>[2]);
          }
          await sync.dismissNotice(notice.id);
        }, action === 'restore' ? `${task.ref}: ${notice.field} restored` : 'Notice dismissed');
      },
    });
  };
  // Remote mode: the latest chat messages that name this task.
  const chatMentions = useQuery(
    async () => (services.chat && query.data && !isProvisional(query.data.number) ? services.chat.mentionsOfTask(session, query.data.number, 3) : []),
    `task-chat:${taskRef}:${query.data?.number ?? ''}`,
    [taskTopic, `chat:${session.workspace.id}`],
  );
  const mentionList = chatMentions.data ?? [];
  // The pull request comes from GitHub (gh), so it loads on its own too.
  const pullRequest = useQuery(
    async () => (query.data?.branch ? services.git.pullRequest(session, taskRef, cwd) : null),
    `pr:${session.workspace.id}:${taskRef}:${query.data?.branch ?? ''}`,
  );
  // Git state loads on its own so the task shows instantly even in big repositories.
  const git = useQuery(() => services.git.inspect(session, taskRef, cwd), `git:${session.workspace.id}:${taskRef}`);

  // Layout: header, title, chips and notices; then Details + Description; the Activity panel gets the rest.
  // Details and Description side by side only when both keep a useful width.
  const wide = width >= 110;
  const showMascot = width >= 80 && height >= 34 && Boolean(task);
  const mascotRows = showMascot ? 15 : 0;
  const titleLines = task ? clampLines(wrapText(task.title, width), 2) : [''];
  const noticeLines = Math.min(2, notices.data?.length ?? 0);
  const detailsHeight = 8;
  // Title, chips (with a gap) and notices; then the details panel (with a gap).
  const headRows = titleLines.length + 2 + noticeLines + 1 + detailsHeight;
  // Stacked (narrow) layouts give the description what is left above the activity's minimum (2 rows + borders);
  // with no room it is hidden (d still edits it).
  const stackedDescription = Math.min(5, height - headRows - 4 - mascotRows);
  const descriptionHeight = wide ? detailsHeight : stackedDescription >= 3 ? stackedDescription : 0;
  const upperRows = headRows + (wide ? 0 : descriptionHeight);
  const timelineRows = Math.max(2, height - upperRows - 2 - mascotRows);
  const showMentions = wide && mentionList.length > 0;
  const activityWidth = showMentions ? Math.floor(width * 0.62) - 4 : width - 4;
  const timeline = task ? timelineLines(task.timeline, activityWidth) : [];
  const actorWidth = Math.min(18, Math.max(8, ...timeline.map((line) => line.actor.length)) + 2);
  const maxScroll = Math.max(0, timeline.length - timelineRows);
  const offset = Math.min(scroll, maxScroll);
  const scrollBy = (delta: number) => setScroll(Math.max(0, Math.min(maxScroll, offset + delta)));

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
        '$': () => actions.price(task),
        d: () => actions.description(task),
        c: () => actions.comment(task),
        e: () => actions.edit(task),
        x: () => actions.toggleDone(task),
        '!': openNotices,
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

  const noticeCount = notices.data?.length ?? 0;
  const hints = [
    ...(noticeCount ? ([['!', `${noticeCount} sync notice${noticeCount === 1 ? '' : 's'}`]] as const) : []),
    ['s', 'status'],
    ['p', 'priority'],
    ['a', 'assign'],
    ...(services.finance ? ([['$', 'ticket price']] as const) : []),
    ['c', 'comment'],
    ['e', 'edit'],
    ['g', 'git'],
    ['x', task?.status === 'done' ? 'reopen' : 'done'],
    ['esc', 'back'],
  ] as const;

  if (!task) {
    return (
      <ScreenFrame title={taskRef} hints={[['esc', 'back']]}>
        {query.error ? <EmptyState lines={[query.error.message, query.error.hint ?? '']} icon={symbols.cross} /> : <Spinner label="Loading…" />}
        {width >= 80 && height >= 20 ? <Mascot scene={syncStatus?.syncing ? 'syncing' : query.loading ? 'clockIn' : 'bugHunt'} paused={!active} /> : null}
      </ScreenFrame>
    );
  }

  const end = timeline.length - offset;
  const visibleTimeline = timeline.slice(Math.max(0, end - timelineRows), end);
  const description = task.description ? clampLines(wrapText(task.description, (wide ? width - Math.floor(width / 2) : width) - 5), Math.max(1, descriptionHeight - 2)) : [];
  const detailsWidth = wide ? Math.floor(width / 2) : width;
  return (
    <ScreenFrame
      title={`${task.ref} · ${TYPE_LABELS[task.type]}`}
      aside={width >= 70 ? `created ${formatStamp(task.createdAt)}${task.creator ? ` by @${task.creator.username}` : ''} ${symbols.dot} updated ${formatRelative(task.updatedAt)}` : undefined}
      hints={hints}
    >
      {titleLines.map((line, index) => (
        <Text key={index} bold color={palette.text}>
          {line}
        </Text>
      ))}
      <Box gap={2} marginTop={1}>
        <Clickable onClick={() => actions.status(task)} active={active}>
          <StatusBadge status={task.status} />
        </Clickable>
        <Clickable onClick={() => actions.priority(task)} active={active}>
          <PriorityMeter priority={task.priority} />
        </Clickable>
        {task.archivedAt ? <Badge tone="warning">{`archived ${formatRelative(task.archivedAt)} · e to restore`}</Badge> : null}
        {isClosed(task.status) && task.completedAt ? <Text color={palette.muted}>{`closed ${formatRelative(task.completedAt)}`}</Text> : null}
      </Box>
      {(notices.data ?? []).slice(0, 2).map((notice) => (
        <Clickable key={notice.id} onClick={openNotices} active={active}>
          <Text color={notice.kind === 'conflict' ? palette.warning : palette.danger} wrap="truncate-end">
            {`! ${notice.message}`}
          </Text>
        </Clickable>
      ))}

      <Box marginTop={1} flexDirection={wide ? 'row' : 'column'} gap={wide ? 1 : 0}>
        <Panel title="Details" width={detailsWidth} height={detailsHeight}>
          <Field label="Project" value={task.project?.name} onClick={() => actions.project(task)} active={active} />
          <Field label="Assignee" value={task.assignee ? `@${task.assignee.username}` : undefined} hint={task.assignee?.displayName} onClick={() => actions.assign(task)} active={active} />
          <Field label="Requested by" value={task.requester ?? undefined} onClick={() => actions.requester(task)} active={active} />
          {services.finance ? <Field label="Pay" value={task.remunerated ? formatMoney(task.priceMinor, task.currencyCode) : 'unpaid'} onClick={() => void actions.price(task)} active={active} /> : null}
          <GitFields
            state={git.data}
            fallbackBranch={task.branch ?? task.suggestedBranch}
            recorded={task.branch !== null}
            closed={isClosed(task.status)}
            onBranch={() => actions.branch(task)}
            onCommits={() => openOverlay({ kind: 'git-log' })}
            active={active}
          />
          <PullRequestField state={task.branch ? pullRequest.data : null} loading={pullRequest.loading} onClick={() => actions.gitMenu(task)} active={active} />
        </Panel>
        {descriptionHeight ? (
        <Panel title="Description" aside={description.length ? 'd edit' : undefined} height={descriptionHeight} flexGrow={1}>
          <Clickable onClick={() => void actions.description(task)} active={active} flexDirection="column">
            {description.length ? (
              description.map((line, index) => (
                <Text key={index} color={palette.text}>
                  {line}
                </Text>
              ))
            ) : (
              <Text color={palette.faint}>No description. Press d (or click) to write one.</Text>
            )}
          </Clickable>
        </Panel>
        ) : null}
      </Box>

      <Box flexGrow={1} gap={1}>
        <Panel title="Activity" aside={maxScroll > 0 ? (offset > 0 ? '↓ newer' : '↑ older') : undefined} height={timelineRows + 2} flexGrow={1}>
          <Clickable onWheel={(direction) => scrollBy(-direction)} active={active} flexDirection="column">
            {visibleTimeline.map((line) => (
              <Text key={line.key} wrap="truncate-end">
                <Text color={palette.faint}>{line.stamp.padEnd(7)}</Text>
                <Text color={line.actor ? palette.muted : palette.faint}>{line.actor.padEnd(actorWidth)}</Text>
                {line.kind === 'comment' ? <Text color={palette.accent}>{line.first ? `${symbols.comment} ` : '  '}</Text> : <Text color={palette.faint}>{'• '}</Text>}
                <Text color={line.kind === 'event' ? palette.muted : palette.text}>{line.text}</Text>
              </Text>
            ))}
            {visibleTimeline.length === 0 ? <Text color={palette.faint}>Nothing yet.</Text> : null}
          </Clickable>
        </Panel>
        {showMentions ? (
          <Panel title="Mentioned in chat" height={timelineRows + 2} width={Math.floor(width * 0.38)}>
            {mentionList.map((message) => (
              <Box key={message.id} flexDirection="column" marginBottom={1}>
                <Text wrap="truncate-end">
                  <Text color={palette.muted}>{`${message.author ? `@${message.author.username}` : 'someone'} `}</Text>
                  <Text color={palette.faint}>{formatStamp(message.createdAt)}</Text>
                </Text>
                <Text color={palette.text} wrap="truncate-end">
                  {message.body.split('\n')[0]}
                </Text>
              </Box>
            ))}
          </Panel>
        ) : null}
      </Box>
      {showMascot && task ? <Mascot scene={syncStatus?.syncing ? 'syncing' : sceneForTask(task)} paused={!active} /> : null}
    </ScreenFrame>
  );
}

function formatMoney(amountMinor: number | null, currencyCode: string | null): string {
  if (amountMinor === null || !currencyCode) return 'price needed';
  const digits = new Intl.NumberFormat('en', { style: 'currency', currency: currencyCode }).resolvedOptions().maximumFractionDigits ?? 2;
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: currencyCode }).format(amountMinor / 10 ** digits);
}

function PullRequestField({ state, loading, onClick, active }: { state: TaskPullRequestState | null | undefined; loading: boolean; onClick: () => void; active: boolean }) {
  return (
    <FieldRow onClick={onClick} active={active}>
      <Box width={LABEL_WIDTH} flexShrink={0}>
        <Text dimColor>Pull request</Text>
      </Box>
      {state?.status === 'found' ? (
        <PullRequestSummary pr={state.pr} />
      ) : state?.status === 'unavailable' ? (
        <Text dimColor wrap="truncate-end">{`${state.reason}${state.hint ? `  ${state.hint}` : ''}`}</Text>
      ) : state?.status === 'none' ? (
        <Text dimColor wrap="truncate-end">{`none · g to open one`}</Text>
      ) : (
        loading && state === undefined ? <Spinner label="checking GitHub…" color={palette.faint} /> : <Text color={palette.faint}>—</Text>
      )}
    </FieldRow>
  );
}

/** A row of the Details panel: clicking it opens what changes it. */
function FieldRow({ onClick, active, children }: { onClick?: (() => void) | undefined; active: boolean; children: ReactNode }) {
  return (
    <Clickable onClick={onClick} active={active}>
      <Box flexGrow={1}>{children}</Box>
    </Clickable>
  );
}

function Field({
  label,
  value,
  hint,
  onClick,
  active = true,
}: {
  label: string;
  value: string | undefined;
  hint?: string | undefined;
  onClick?: (() => void) | undefined;
  active?: boolean;
}) {
  return (
    <FieldRow onClick={onClick} active={active}>
      <Box width={LABEL_WIDTH} flexShrink={0}>
        <Text color={palette.muted}>{label}</Text>
      </Box>
      <Text wrap="truncate-end">
        {value ? <Text color={palette.text}>{value}</Text> : <Text color={palette.faint}>—</Text>}
        {hint ? <Text color={palette.muted}>{value ? `  ${hint}` : `  suggested ${hint}`}</Text> : null}
      </Text>
    </FieldRow>
  );
}

/** Branch and commits rows. Two rows always, so the layout does not jump while Git loads. */
function GitFields({
  state,
  fallbackBranch,
  recorded,
  closed,
  onBranch,
  onCommits,
  active,
}: {
  state: TaskGitState | undefined;
  fallbackBranch: string;
  recorded: boolean;
  closed: boolean;
  onBranch: () => void;
  onCommits: () => void;
  active: boolean;
}) {
  if (!state) {
    return (
      <>
        <Field label="Branch" value={recorded ? fallbackBranch : undefined} hint={recorded ? undefined : fallbackBranch} onClick={onBranch} active={active} />
        <FieldRow active={active}>
          <Box width={LABEL_WIDTH} flexShrink={0}>
            <Text color={palette.muted}>Commits</Text>
          </Box>
          <Spinner label="reading Git…" color={palette.faint} />
        </FieldRow>
      </>
    );
  }
  if (state.status === 'unavailable') {
    return (
      <>
        <Field label="Branch" value={recorded ? fallbackBranch : undefined} hint={recorded ? undefined : fallbackBranch} onClick={onBranch} active={active} />
        <FieldRow onClick={onBranch} active={active}>
          <Box width={LABEL_WIDTH} flexShrink={0}>
            <Text color={palette.muted}>Git</Text>
          </Box>
          <Text color={palette.faint} wrap="truncate-end">
            {state.reason}
          </Text>
        </FieldRow>
      </>
    );
  }

  const [latest] = state.commits;
  return (
    <>
      <FieldRow onClick={onBranch} active={active}>
        <Box width={LABEL_WIDTH} flexShrink={0}>
          <Text color={palette.muted}>Branch</Text>
        </Box>
        {/* The state first: branch names are long and are the part that gets cut. */}
        <Text wrap="truncate-end">
          {state.checkedOut ? (
            <Text color={palette.success}>{`${symbols.active} checked out  `}</Text>
          ) : state.branchExists ? (
            <Text color={palette.muted}>{'not checked out  '}</Text>
          ) : state.recorded && !closed ? (
            <Text color={palette.warning}>{'deleted, no merge found · b recreate · g forget  '}</Text>
          ) : state.recorded ? (
            <Text color={palette.muted}>{'deleted  '}</Text>
          ) : closed ? null : (
            <Text color={palette.muted}>{'suggested · b to start  '}</Text>
          )}
          {state.uncommitted > 0 ? <Text color={palette.warning}>{`${state.uncommitted} uncommitted  `}</Text> : null}
          <Text color={state.branchExists ? palette.text : palette.faint}>{closed && !state.recorded && !state.branchExists ? '—' : state.branch}</Text>
        </Text>
      </FieldRow>
      <FieldRow onClick={onCommits} active={active}>
        <Box width={LABEL_WIDTH} flexShrink={0}>
          <Text color={palette.muted}>Commits</Text>
        </Box>
        {latest ? (
          <Text wrap="truncate-end">
            <Text color={palette.warning}>{latest.shortHash}</Text>
            <Text>{` ${latest.subject}`}</Text>
            <Text dimColor>{`  ${formatRelative(latest.date)}${state.commits.length > 1 ? `  +${state.commits.length - 1} more` : ''}`}</Text>
          </Text>
        ) : (
          <Text color={palette.faint}>none yet</Text>
        )}
      </FieldRow>
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
