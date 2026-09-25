import { Box, Text } from 'ink';
import { useState } from 'react';
import { useAppState } from '../app-state.js';
import { EmptyState } from '../components/EmptyState.js';
import { TaskTable, tableRows } from '../components/TaskTable.js';
import { TextField } from '../components/TextField.js';
import { palette } from '../theme/theme.js';
import { EMPTY_SEARCH } from '../copy.js';
import { useList } from '../hooks/use-list.js';
import { useQuery } from '../hooks/use-query.js';
import { Layer } from '../input/dispatcher.js';
import { useKeys } from '../input/KeyProvider.js';
import { OverlayFrame, useOverlayHeight, useOverlayWidth } from './OverlayFrame.js';
import type { Overlay } from './types.js';

const WIDTH = 104;

/** Live search by title or ID. Results update on every keystroke. */
export function SearchOverlay({ spec }: { spec: Overlay }) {
  const { services, session, closeOverlay, go } = useAppState();
  const width = useOverlayWidth(WIDTH);
  const [query, setQuery] = useState('');
  const results = useQuery(() => services.tasks.search(session, query, 100), `search:${session.workspace.id}:${query}`);
  const tasks = results.data ?? [];
  const tableHeight = Math.min(16, useOverlayHeight() - 3);
  const open = (index: number) => {
    const task = tasks[index];
    if (!task) return;
    closeOverlay(spec);
    go({ type: 'push', route: { name: 'task', ref: task.ref } });
  };
  const list = useList(tasks.length, tableRows(tableHeight), false);

  useKeys(Layer.overlay, (input, key) => {
    if (key.escape) closeOverlay(spec);
    else if (key.return) open(list.index);
    else list.handleKey(input, key);
    return true;
  });

  return (
    <OverlayFrame
      title="Search"
      context="title or ID, closed and archived too"
      width={WIDTH}
      hints={[
        ['↑/↓', 'move'],
        ['enter', 'open'],
        ['esc', 'close'],
      ]}
    >
      <Box marginBottom={1}>
        <TextField
          value={query}
          onChange={(next) => {
            setQuery(next);
            list.select(0);
          }}
          placeholder="stripe, SOJA-12…"
        />
      </Box>
      {!query.trim() ? (
        <Text color={palette.faint}>Start typing: a word from the title, or a number like 12.</Text>
      ) : tasks.length === 0 && !results.loading ? (
        <EmptyState lines={EMPTY_SEARCH} />
      ) : (
        <TaskTable
          tasks={tasks}
          selected={list.index}
          offset={list.offset}
          height={tableHeight}
          width={width}
          layer={Layer.overlay}
          onSelect={(index) => list.select(index)}
          onOpen={open}
          onScroll={(delta) => list.select(list.index + delta)}
        />
      )}
    </OverlayFrame>
  );
}
