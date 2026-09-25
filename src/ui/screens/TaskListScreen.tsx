import { Box, Text } from 'ink';
import { useEffect, useRef, useState } from 'react';
import { FILTER_LABELS, TASK_FILTERS, type TaskFilter } from '../../application/filters.js';
import type { ProjectSummary, TaskView } from '../../application/types.js';
import type { PullRequest } from '../../git/types.js';
import { activeCount, countStatuses, TYPE_LABELS, type StatusCounts } from '../../domain/task.js';
import { formatRelative } from '../../utils/time.js';
import { useAppState } from '../app-state.js';
import { EmptyState } from '../components/EmptyState.js';
import { PriorityMeter, StatusBadge } from '../components/Labels.js';
import { PullRequestSummary } from '../components/PullRequestLabel.js';
import { TaskTable, tableRows } from '../components/TaskTable.js';
import { EMPTY_TASKS, summaryRemark } from '../copy.js';
import { useLayout } from '../hooks/use-layout.js';
import { useList } from '../hooks/use-list.js';
import { useQuery } from '../hooks/use-query.js';
import { useTaskActions } from '../hooks/use-task-actions.js';
import { Layer } from '../input/dispatcher.js';
import { useKeys } from '../input/KeyProvider.js';
import { Panel } from '../kit/Panel.js';
import { Tabs } from '../kit/Tabs.js';
import { palette, symbols } from '../theme/theme.js';
import { Mascot } from '../mascot/Mascot.js';
import { sceneForTaskList } from '../mascot/selection.js';
import { clampLines, wrapText } from '../../utils/text.js';
import { ScreenFrame } from './ScreenFrame.js';

const HEADING: Record<TaskFilter, string> = { ...FILTER_LABELS, mine: 'My work' };
const TAB_LABELS: Record<TaskFilter, string> = { ...FILTER_LABELS, mine: 'Mine', all: 'All' };
const NO_TASKS: TaskView[] = [];
/** Rows of the preview panel, including its borders. */
const PREVIEW_ROWS = 8;

interface TaskListScreenProps {
  active: boolean;
  /** Scopes the list to one project (the project screen). */
  projectId?: string;
  initialFilter?: TaskFilter;
}

/** "What do I have to do now?" Home is this screen with no project. */
export function TaskListScreen({ active, projectId, initialFilter }: TaskListScreenProps) {
  const { services, session, go, cwd, homeFilter, setHomeFilter, syncStatus } = useAppState();
  const actions = useTaskActions();
  const { width, height } = useLayout();
  // Home shares its filter with the sidebar; a project list keeps its own.
  const [projectFilter, setProjectFilter] = useState<TaskFilter>(initialFilter ?? 'all');
  const filter = projectId ? projectFilter : homeFilter;
  const setFilter = projectId ? setProjectFilter : setHomeFilter;

  const scope = projectId ? { projectId } : {};
  const tasks = useQuery(
    () => services.tasks.list(session, filter, scope),
    `tasks:${session.workspace.id}:${filter}:${projectId ?? ''}`,
    [`tasks:${session.workspace.id}`],
  );
  // GitHub pull requests of the listed tasks (one cached `gh` call per repository).
  const withBranch = (tasks.data ?? []).filter((task) => task.branch);
  const pullRequests = useQuery(
    () => services.git.pullRequestIndex(session, cwd, withBranch),
    `prs:${withBranch.map((task) => `${task.id}:${task.branch ?? ''}`).join(',')}`,
  );
  const project = useQuery<ProjectSummary | null>(
    async () => (projectId ? ((await services.projects.list(session)).find((p) => p.id === projectId) ?? null) : null),
    `project:${projectId ?? ''}`,
    [`projects:${session.workspace.id}`, `tasks:${session.workspace.id}`],
  );

  const list = tasks.data ?? NO_TASKS;
  // Tabs and a gap; the project line; the preview panel when there is room for it.
  const withPreview = height >= 22 && list.length > 0;
  const showMascot = width >= 80 && height >= 34;
  const mascotRows = showMascot ? 15 : 0;
  const chromeRows = 2 + (projectId ? 2 : 0) + (withPreview ? PREVIEW_ROWS : 0);
  const tableHeight = Math.max(3, height - chromeRows - mascotRows);
  const nav = useList(list.length, tableRows(tableHeight));
  const selected = list[nav.index];
  const selectedId = useRef<string | null>(null);

  useEffect(() => {
    if (tasks.loading) return;
    const remembered = selectedId.current;
    if (remembered) {
      const nextIndex = list.findIndex((task) => task.id === remembered);
      if (nextIndex >= 0) {
        if (nextIndex !== nav.index) nav.select(nextIndex);
        selectedId.current = list[nextIndex]?.id ?? null;
        return;
      }
    }
    selectedId.current = list[nav.index]?.id ?? null;
  }, [tasks.loading, tasks.data, nav.index, list, nav]);

  const pick = (next: TaskFilter) => {
    selectedId.current = null;
    setFilter(next);
    nav.select(0);
  };
  const setFilterAt = (index: number) => {
    const next = TASK_FILTERS[(index + TASK_FILTERS.length) % TASK_FILTERS.length];
    if (next) pick(next);
  };
  const open = (task: TaskView | undefined) => {
    if (task) go({ type: 'push', route: { name: 'task', ref: task.ref } });
  };

  useKeys(
    Layer.screen,
    (input, key) => {
      if (nav.handleKey(input, key)) return true;
      if (key.ctrl || key.meta) return false;
      // Archived is not a tab: moving right from it lands on the first tab, left on the last.
      const tabIndex = (TASK_FILTERS as readonly TaskFilter[]).indexOf(filter);
      if ((key.tab && !key.shift) || input === 'l' || key.rightArrow) setFilterAt(tabIndex + 1);
      else if ((key.tab && key.shift) || input === 'h' || key.leftArrow) setFilterAt(tabIndex === -1 ? TASK_FILTERS.length - 1 : tabIndex - 1);
      else if (/^[1-7]$/.test(input)) setFilterAt(Number(input) - 1);
      else if (key.return) open(selected);
      else if (input === 's' && selected) actions.status(selected);
      else if (input === 'a' && selected) void actions.assign(selected);
      else if (input === 'x' && selected) void actions.toggleDone(selected);
      else return false;
      return true;
    },
    active,
  );

  const counts = countStatuses(list);
  const compactTabs = width < 96;
  const title = project.data ? `${project.data.name} · ${project.data.key}` : HEADING[filter];
  return (
    <ScreenFrame
      title={title}
      aside={summaryText(filter, counts, list.length)}
      hints={[
        ['↑↓', 'move'],
        ['enter', 'open'],
        ['n', 'new'],
        ['s', 'status'],
        ['x', 'done'],
        ['←→', 'filter'],
        ['/', 'search'],
        [':', 'commands'],
        ['?', 'help'],
      ]}
    >
      {project.data ? <ProjectLine project={project.data} /> : null}
      <Box justifyContent="space-between">
        <Tabs
          items={TASK_FILTERS.map((value, index) => ({ value, label: TAB_LABELS[value], shortcut: String(index + 1) }))}
          value={(TASK_FILTERS as readonly TaskFilter[]).includes(filter) ? filter : null}
          onChange={pick}
          active={active}
          compact={compactTabs}
        />
        {filter === 'archived' ? <Text color={palette.warning}>{'archived tasks'}</Text> : null}
      </Box>
      <Box marginTop={1} flexDirection="column" height={tableHeight}>
        {tasks.error ? (
          <EmptyState lines={[tasks.error.message, tasks.error.hint ?? '']} icon={symbols.cross} />
        ) : list.length === 0 && !tasks.loading ? (
          <EmptyState lines={EMPTY_TASKS[filter]} icon={symbols.check} />
        ) : (
          <TaskTable
            tasks={list}
            selected={nav.index}
            offset={nav.offset}
            height={tableHeight}
            width={width}
            showAssignee={filter !== 'mine'}
            pullRequests={pullRequests.data}
            onSelect={(index) => nav.select(index)}
            onOpen={(index) => open(list[index])}
            onScroll={(delta) => nav.select(nav.index + delta)}
            active={active}
          />
        )}
      </Box>
      {withPreview && selected ? <TaskPreview task={selected} pr={pullRequests.data?.get(selected.id)} width={width} remark={summaryRemark(counts)} /> : null}
      {showMascot ? <Mascot scene={sceneForTaskList(list, filter, syncStatus?.syncing ?? false)} paused={!active} /> : null}
    </ScreenFrame>
  );
}

function summaryText(filter: TaskFilter, counts: StatusCounts, total: number): string | undefined {
  if (total === 0) return undefined;
  if (filter === 'done' || filter === 'archived') return `${total} ${filter}`;
  return `${activeCount(counts)} active ${symbols.dot} ${counts.in_progress} in progress ${symbols.dot} ${counts.review} review ${symbols.dot} ${counts.blocked} blocked`;
}

/** The selected task at a glance, so most of the time you do not need to open it. */
function TaskPreview({ task, pr, width, remark }: { task: TaskView; pr: PullRequest | undefined; width: number; remark: string | null }) {
  const description = task.description ? clampLines(wrapText(task.description, width - 4), 2) : [];
  const meta = [
    TYPE_LABELS[task.type],
    task.project?.name,
    task.assignee ? `@${task.assignee.username}` : 'unassigned',
    task.requester ? `for ${task.requester}` : null,
    `updated ${formatRelative(task.updatedAt)}`,
  ].filter(Boolean);
  return (
    <Box marginTop={1}>
      <Panel title={task.ref} aside={remark ?? undefined} height={PREVIEW_ROWS - 1} flexGrow={1}>
        <Text wrap="truncate-end" color={palette.text} bold>
          {task.title}
        </Text>
        <Box gap={2}>
          <StatusBadge status={task.status} />
          <PriorityMeter priority={task.priority} />
          <Text color={palette.muted} wrap="truncate-end">
            {meta.join(` ${symbols.dot} `)}
          </Text>
        </Box>
        {pr ? (
          <PullRequestSummary pr={pr} />
        ) : task.branch ? (
          <Text color={palette.muted} wrap="truncate-end">{`${symbols.link} ${task.branch}`}</Text>
        ) : (
          <Text color={palette.faint}>{'no branch yet · b in the task starts one'}</Text>
        )}
        {description.length ? (
          description.map((line, index) => (
            <Text key={index} color={palette.muted}>
              {line}
            </Text>
          ))
        ) : (
          <Text color={palette.faint}>{'No description.'}</Text>
        )}
      </Panel>
    </Box>
  );
}

function ProjectLine({ project }: { project: ProjectSummary }) {
  const location = project.repositoryPath ?? project.repositoryUrl;
  return (
    <Box marginBottom={1}>
      <Text color={palette.muted} wrap="truncate-end">
        {[project.description, `${project.active} active`, `${project.counts.done} done`, location].filter(Boolean).join(`  ${symbols.dot}  `)}
      </Text>
    </Box>
  );
}
