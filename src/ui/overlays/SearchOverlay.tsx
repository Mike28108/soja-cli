import { Box, Text } from 'ink';
import { useState } from 'react';
import { useAppState } from '../app-state.js';
import { EmptyState } from '../components/EmptyState.js';
import { TaskTable, tableRows } from '../components/TaskTable.js';
import { TextInput } from '../components/TextInput.js';
import { EMPTY_SEARCH } from '../copy.js';
import { useLayout } from '../hooks/use-layout.js';
import { useList } from '../hooks/use-list.js';
import { useQuery } from '../hooks/use-query.js';
import { Layer } from '../input/dispatcher.js';
import { useKeys } from '../input/KeyProvider.js';
import { OverlayFrame, useOverlayHeight } from './OverlayFrame.js';
import type { Overlay } from './types.js';

/** Live search by title or ID. Results update on every keystroke. */
export function SearchOverlay({ spec }: { spec: Overlay }) {
  const { services, session, closeOverlay, go } = useAppState();
  const { width } = useLayout();
  const [query, setQuery] = useState('');
  const results = useQuery(() => services.tasks.search(session, query, 100), `search:${session.workspace.id}:${query}`);
  const tasks = results.data ?? [];
  const tableHeight = useOverlayHeight() - 2;
  const list = useList(tasks.length, tableRows(tableHeight), false);

  useKeys(Layer.overlay, (input, key) => {
    if (key.escape) closeOverlay(spec);
    else if (key.return) {
      const task = tasks[list.index];
      if (task) {
        closeOverlay(spec);
        go({ type: 'push', route: { name: 'task', ref: task.ref } });
      }
    } else list.handleKey(input, key);
    return true;
  });

  return (
    <OverlayFrame
      title="Search"
      context="title or ID"
      hints={[
        ['↑/↓', 'move'],
        ['enter', 'open'],
        ['esc', 'close'],
      ]}
    >
      <Box marginBottom={1}>
        <TextInput
          value={query}
          onChange={(next) => {
            setQuery(next);
            list.select(0);
          }}
          placeholder="stripe, SOJA-12…"
          prompt="/"
        />
      </Box>
      {!query.trim() ? (
        <Text dimColor>  Start typing. Closed tasks are included.</Text>
      ) : tasks.length === 0 && !results.loading ? (
        <EmptyState lines={EMPTY_SEARCH} />
      ) : (
        <TaskTable tasks={tasks} selected={list.index} offset={list.offset} height={tableHeight} width={width} />
      )}
    </OverlayFrame>
  );
}
