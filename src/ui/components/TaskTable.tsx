import { Box, Text } from 'ink';
import type { TaskView } from '../../application/types.js';
import type { PullRequest } from '../../git/types.js';
import { Layer } from '../input/dispatcher.js';
import { Clickable } from '../kit/Clickable.js';
import { ScrollBar } from '../kit/ScrollBar.js';
import { palette, symbols } from '../theme/theme.js';
import { PriorityMeter, StatusBadge } from './Labels.js';
import { PullRequestMark } from './PullRequestLabel.js';
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
  /** Mouse: a click selects; clicking the selected row opens it. */
  onSelect?: ((index: number) => void) | undefined;
  onOpen?: ((index: number) => void) | undefined;
  /** Mouse wheel over the table. */
  onScroll?: ((delta: 1 | -1) => void) | undefined;
  layer?: Layer;
  active?: boolean;
}

export function TaskTable({
  tasks,
  selected,
  offset,
  height,
  width,
  showAssignee = false,
  showHeader = true,
  pullRequests,
  onSelect,
  onOpen,
  onScroll,
  layer = Layer.screen,
  active = true,
}: TaskTableProps) {
  const refWidth = Math.max(8, ...tasks.map((task) => task.ref.length));
  const columns = layoutTaskColumns(width, { showAssignee, refWidth });
  const rows = tableRows(height, showHeader);
  const visible = tasks.slice(offset, offset + rows);

  return (
    <Clickable onWheel={onScroll} layer={layer} active={active} flexDirection="column" width={width} height={height}>
      <Box flexDirection="column" flexGrow={1}>
        {showHeader ? (
          <Box>
            <Box width={2} />
            <Cell width={columns.ref} text="ID" />
            <Cell width={columns.priority} text={columns.priorityLabel ? "PRIORITY" : "PRI"} />
            <Cell width={columns.status} text={columns.statusGlyphOnly ? '' : 'STATUS'} />
            {columns.project ? <Cell width={columns.project} text="PROJECT" /> : null}
            {columns.assignee ? <Cell width={columns.assignee} text="ASSIGNEE" /> : null}
            <Cell width={columns.title} text="TITLE" />
          </Box>
        ) : null}
        <Box>
          <Box flexDirection="column" flexGrow={1}>
            {visible.map((task, position) => {
              const index = offset + position;
              const isSelected = index === selected;
              const pr = pullRequests?.get(task.id);
              const bg = isSelected ? { backgroundColor: palette.selection } : {};
              const closed = task.status === 'cancelled' || task.status === 'done';
              return (
                <Clickable
                  key={task.id}
                  layer={layer}
                  active={active}
                  width="100%"
                  onClick={() => (isSelected ? onOpen?.(index) : onSelect?.(index))}
                >
                  <Box flexGrow={1} {...bg}>
                    <Box width={2} flexShrink={0}>
                      <Text color={palette.accent} {...bg}>
                        {isSelected ? `${symbols.pointer} ` : '  '}
                      </Text>
                    </Box>
                    <Box width={columns.ref} flexShrink={0}>
                      <Text color={isSelected ? palette.accent : palette.muted} bold={isSelected} {...bg}>
                        {task.ref}
                      </Text>
                    </Box>
                    <Box width={columns.priority} flexShrink={0}>
                      <PriorityMeter priority={task.priority} label={columns.priorityLabel} background={bg.backgroundColor} />
                    </Box>
                    <Box width={columns.status} flexShrink={0}>
                      <StatusBadge status={task.status} glyphOnly={columns.statusGlyphOnly} />
                    </Box>
                    {columns.project ? (
                      <Box width={columns.project} flexShrink={0} paddingRight={1}>
                        <Text color={task.project ? palette.muted : palette.faint} wrap="truncate-end" {...bg}>
                          {task.project?.name ?? '—'}
                        </Text>
                      </Box>
                    ) : null}
                    {columns.assignee ? (
                      <Box width={columns.assignee} flexShrink={0} paddingRight={1}>
                        <Text color={palette.muted} wrap="truncate-end" {...bg}>
                          {task.assignee ? `@${task.assignee.username}` : '—'}
                        </Text>
                      </Box>
                    ) : null}
                    <Box flexGrow={1} flexShrink={1}>
                      <Text wrap="truncate-end" {...bg}>
                        {task.archivedAt ? <Text color={palette.faint}>{'archived · '}</Text> : null}
                        {pr ? <PullRequestMark pr={pr} /> : null}
                        <Text color={closed ? palette.muted : palette.text} bold={isSelected} strikethrough={task.status === 'cancelled'}>
                          {task.title}
                        </Text>
                      </Text>
                    </Box>
                  </Box>
                </Clickable>
              );
            })}
          </Box>
          <ScrollBar total={tasks.length} visible={rows} offset={offset} height={Math.min(rows, tasks.length)} />
        </Box>
      </Box>
    </Clickable>
  );
}

function Cell({ width, text }: { width: number; text: string }) {
  return (
    <Box width={width} paddingRight={1} flexShrink={0}>
      <Text color={palette.faint} bold wrap="truncate-end">
        {text}
      </Text>
    </Box>
  );
}

/** Task rows that fit in `height`, which is what list navigation must scroll by. */
export function tableRows(height: number, showHeader = true): number {
  return Math.max(1, height - (showHeader ? 1 : 0));
}
