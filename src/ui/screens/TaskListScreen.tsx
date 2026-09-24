import { Box, Text } from 'ink';
import { useState } from 'react';
import { FILTER_LABELS, TASK_FILTERS, type TaskFilter } from '../../application/filters.js';
import type { ProjectSummary } from '../../application/types.js';
import { activeCount, countStatuses, type StatusCounts } from '../../domain/task.js';
import { useAppState } from '../app-state.js';
import { EmptyState } from '../components/EmptyState.js';
import { TaskTable, tableRows } from '../components/TaskTable.js';
import { EMPTY_TASKS, summaryRemark } from '../copy.js';
import { useLayout } from '../hooks/use-layout.js';
import { useList } from '../hooks/use-list.js';
import { useQuery } from '../hooks/use-query.js';
import { useTaskActions } from '../hooks/use-task-actions.js';
import { Layer } from '../input/dispatcher.js';
import { useKeys } from '../input/KeyProvider.js';
import { palette, symbols } from '../theme/theme.js';
import { ScreenFrame } from './ScreenFrame.js';

const HEADING: Record<TaskFilter, string> = { ...FILTER_LABELS, mine: 'My Work' };
const TAB_LABELS: Record<TaskFilter, string> = { ...FILTER_LABELS, mine: 'Mine', all: 'All' };

interface TaskListScreenProps {
  active: boolean;
  /** Scopes the list to one project (the project screen). */
  projectId?: string;
  initialFilter?: TaskFilter;
}

/** "What do I have to do now?" Home is this screen with no project. */
export function TaskListScreen({ active, projectId, initialFilter }: TaskListScreenProps) {
  const { services, session, go, cwd } = useAppState();
  const actions = useTaskActions();
  const { width, height } = useLayout();
  const [filter, setFilter] = useState<TaskFilter>(initialFilter ?? (projectId ? 'all' : 'mine'));

  const scope = projectId ? { projectId } : {};
  const tasks = useQuery(
    () => services.tasks.list(session, filter, scope),
    `tasks:${session.workspace.id}:${filter}:${projectId ?? ''}`,
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
  );

  const list = tasks.data ?? [];
  // Heading, gap, gap, summary; plus the project heading (two lines and a gap).
  const chromeRows = 4 + (projectId ? 3 : 0);
  const tableHeight = Math.max(3, height - chromeRows);
  const nav = useList(list.length, tableRows(tableHeight));
  const selected = list[nav.index];

  const setFilterAt = (index: number) => {
    const next = TASK_FILTERS[(index + TASK_FILTERS.length) % TASK_FILTERS.length];
    if (next) {
      setFilter(next);
      nav.select(0);
    }
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
      else if (key.return && selected) go({ type: 'push', route: { name: 'task', ref: selected.ref } });
      else if (input === 's' && selected) actions.status(selected);
      else if (input === 'a' && selected) void actions.assign(selected);
      else if (input === 'x' && selected) void actions.toggleDone(selected);
      else return false;
      return true;
    },
    active,
  );

  const counts = countStatuses(list);
  return (
    <ScreenFrame
      hints={[
        ['j/k', 'move'],
        ['enter', 'open'],
        ['n', 'new'],
        ['h/l', 'filter'],
        ['/', 'search'],
        [':', 'commands'],
        ['?', 'help'],
      ]}
    >
      {project.data ? <ProjectHeading project={project.data} /> : null}
      <Box justifyContent="space-between">
        <Text bold>{projectId ? HEADING[filter] : HEADING[filter].toUpperCase()}</Text>
        <FilterTabs current={filter} width={width - HEADING[filter].length - 4} />
      </Box>
      <Box marginTop={1} flexDirection="column" height={tableHeight}>
        {tasks.error ? (
          <EmptyState lines={[tasks.error.message, tasks.error.hint ?? '']} />
        ) : list.length === 0 && !tasks.loading ? (
          <EmptyState lines={EMPTY_TASKS[filter]} />
        ) : (
          <TaskTable
            tasks={list}
            selected={nav.index}
            offset={nav.offset}
            height={tableHeight}
            width={width}
            showAssignee={filter !== 'mine'}
            pullRequests={pullRequests.data}
          />
        )}
      </Box>
      <Box marginTop={1} justifyContent="space-between">
        <Summary filter={filter} counts={counts} total={list.length} />
        {list.length > tableRows(tableHeight) ? <Text dimColor>{`${nav.index + 1}/${list.length}`}</Text> : null}
      </Box>
    </ScreenFrame>
  );
}

function FilterTabs({ current, width }: { current: TaskFilter; width: number }) {
  // Labels with their number shortcut when there is room; the active one only when very narrow.
  const full = TASK_FILTERS.map((filter, index) => `${index + 1} ${TAB_LABELS[filter]}`).join('  ');
  const compact = full.length > width;
  if (compact && width < 30) return <Text color={palette.accent}>{TAB_LABELS[current]}</Text>;
  return (
    <Box gap={compact ? 1 : 2}>
      {TASK_FILTERS.map((filter, index) => (
        <Text key={filter} color={filter === current ? palette.accent : undefined} dimColor={filter !== current} bold={filter === current}>
          {compact ? TAB_LABELS[filter] : `${index + 1} ${TAB_LABELS[filter]}`}
        </Text>
      ))}
    </Box>
  );
}

function Summary({ filter, counts, total }: { filter: TaskFilter; counts: StatusCounts; total: number }) {
  if (total === 0) return <Text> </Text>;
  if (filter === 'done') return <Text dimColor>{`${total} done`}</Text>;
  const remark = summaryRemark(counts);
  const sep = ` ${symbols.dot} `;
  return (
    <Text>
      <Text>{`${activeCount(counts)} active`}</Text>
      <Text dimColor>{sep}</Text>
      <Text color={counts.in_progress ? palette.warning : undefined} dimColor={!counts.in_progress}>{`${counts.in_progress} in progress`}</Text>
      <Text dimColor>{sep}</Text>
      <Text color={counts.review ? palette.info : undefined} dimColor={!counts.review}>{`${counts.review} review`}</Text>
      <Text dimColor>{sep}</Text>
      <Text color={counts.blocked ? palette.danger : undefined} dimColor={!counts.blocked}>{`${counts.blocked} blocked`}</Text>
      {remark ? <Text dimColor>{`   ${remark}`}</Text> : null}
    </Text>
  );
}

function ProjectHeading({ project }: { project: ProjectSummary }) {
  const location = project.repositoryPath ?? project.repositoryUrl;
  return (
    <Box flexDirection="column" marginBottom={1}>
      <Text>
        <Text bold color={palette.accent}>
          {project.name}
        </Text>
        <Text dimColor>{`  ${project.key}${project.description ? `  ${symbols.dot}  ${project.description}` : ''}`}</Text>
      </Text>
      <Text dimColor wrap="truncate-end">
        {`${project.active} active ${symbols.dot} ${project.counts.done} done`}
        {location ? `  ${symbols.dot}  ${location}` : ''}
      </Text>
    </Box>
  );
}
