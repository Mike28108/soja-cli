import { Box, Text } from 'ink';
import type { TaskView } from '../../application/types.js';
import type { PullRequest } from '../../git/types.js';
import { PullRequestMark } from './PullRequestLabel.js';
import { palette, symbols } from '../theme/theme.js';
import { PriorityLabel, StatusLabel } from './Labels.js';
import { layoutTaskColumns } from './task-columns.js';

interface TaskTableProps {
  tasks: readonly TaskView[];
  selected: number;
  offset: number;
  height: number;
  width: number;
  showAssignee?: boolean;
  showHeader?: boolean;
  /** Pull requests by task id, shown before the title. */
  pullRequests?: ReadonlyMap<string, PullRequest> | undefined;
}

export function TaskTable({ tasks, selected, offset, height, width, showAssignee = false, showHeader = true, pullRequests }: TaskTableProps) {
  const refWidth = Math.max(8, ...tasks.map((task) => task.ref.length));
  const columns = layoutTaskColumns(width, { showAssignee, refWidth });
  const rows = tableRows(height, showHeader);
  const visible = tasks.slice(offset, offset + rows);

  return (
    <Box flexDirection="column">
      {showHeader ? (
        <Box>
          <Box width={2} />
          <Cell width={columns.ref} dim text="ID" />
          <Cell width={columns.priority} dim text="PRI" />
          {columns.project ? <Cell width={columns.project} dim text="PROJECT" /> : null}
          <Cell width={columns.status} dim text={columns.statusGlyphOnly ? '' : 'STATUS'} />
          {columns.assignee ? <Cell width={columns.assignee} dim text="ASSIGNEE" /> : null}
          <Cell width={columns.title} dim text="TITLE" />
        </Box>
      ) : null}
      {visible.map((task, position) => {
        const isSelected = offset + position === selected;
        const pr = pullRequests?.get(task.id);
        return (
          <Box key={task.id}>
            <Box width={2}>
              <Text color={palette.accent}>{isSelected ? symbols.pointer : ' '}</Text>
            </Box>
            <Box width={columns.ref}>
              <Text color={isSelected ? palette.accent : undefined} dimColor={!isSelected}>
                {task.ref}
              </Text>
            </Box>
            <Box width={columns.priority}>
              <PriorityLabel priority={task.priority} />
            </Box>
            {columns.project ? <Cell width={columns.project} dim={!task.project} text={task.project?.name ?? '—'} /> : null}
            <Box width={columns.status}>
              <StatusLabel status={task.status} glyphOnly={columns.statusGlyphOnly} />
            </Box>
            {columns.assignee ? (
              <Cell width={columns.assignee} dim text={task.assignee ? `@${task.assignee.username}` : '—'} />
            ) : null}
            <Box width={columns.title}>
              <Text wrap="truncate-end">
                {task.archivedAt ? <Text dimColor>{'archived · '}</Text> : null}
                {pr ? <PullRequestMark pr={pr} /> : null}
                <Text bold={isSelected} dimColor={task.status === 'cancelled'} strikethrough={task.status === 'cancelled'}>
                  {task.title}
                </Text>
              </Text>
            </Box>
          </Box>
        );
      })}
    </Box>
  );
}

function Cell({ width, text, dim = false }: { width: number; text: string; dim?: boolean }) {
  return (
    <Box width={width} paddingRight={1}>
      <Text dimColor={dim} wrap="truncate-end">
        {text}
      </Text>
    </Box>
  );
}

/** Task rows that fit in `height`, which is what list navigation must scroll by. */
export function tableRows(height: number, showHeader = true): number {
  return Math.max(1, height - (showHeader ? 1 : 0));
}
