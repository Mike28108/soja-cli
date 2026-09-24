import { Box, Text } from 'ink';
import { useState } from 'react';
import type { TaskView } from '../../application/types.js';
import type { ChangeKind } from '../../git/types.js';
import { useAppState } from '../app-state.js';
import { useList } from '../hooks/use-list.js';
import { useQuery } from '../hooks/use-query.js';
import { Layer } from '../input/dispatcher.js';
import { useKeys } from '../input/KeyProvider.js';
import { palette, symbols, type ColorName } from '../theme/theme.js';
import { OverlayFrame, useOverlayHeight } from './OverlayFrame.js';
import type { Overlay } from './types.js';

const KIND: Record<ChangeKind, { letter: string; color?: ColorName }> = {
  modified: { letter: 'M', color: 'yellow' },
  added: { letter: 'A', color: 'green' },
  untracked: { letter: '?', color: 'green' },
  deleted: { letter: 'D', color: 'red' },
  renamed: { letter: 'R', color: 'cyan' },
  copied: { letter: 'C', color: 'cyan' },
  typechange: { letter: 'T', color: 'yellow' },
  conflicted: { letter: 'U', color: 'red' },
};

/** Step 1 of a commit: choose files (all selected by default). Step 2 asks for the message. */
export function CommitOverlay({ spec }: { spec: Extract<Overlay, { kind: 'commit' }> }) {
  const { services, session, cwd, closeOverlay, openOverlay, notify } = useAppState();
  const task: TaskView = spec.task;
  const state = useQuery(() => services.git.workingState(session, task, cwd), `commit:${task.id}`);
  const files = state.data?.files ?? [];
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(new Set());
  const height = useOverlayHeight() - 3;
  const list = useList(files.length, height);
  const selected = files.filter((file) => !excluded.has(file.path));

  const toggle = (path: string) =>
    setExcluded((previous) => {
      const next = new Set(previous);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });

  const proceed = () => {
    if (selected.length === 0) {
      notify('Select at least one file.', 'error');
      return;
    }
    const paths = selected.map((file) => file.path);
    openOverlay({
      kind: 'prompt',
      title: 'Commit message',
      context: `${task.ref} · ${selected.length} file${selected.length === 1 ? '' : 's'} · “(${task.ref})” is added`,
      placeholder: 'Deduplicate Stripe webhook events',
      onSubmit: (message) =>
        openOverlay({
          kind: 'git-run',
          title: 'Commit',
          context: task.ref,
          run: async () => {
            const result = await services.git.commit(session, task, { cwd, message, paths });
            return `Committed ${result.hash.slice(0, 7)} “${result.subject}” (${result.files} file${result.files === 1 ? '' : 's'})`;
          },
        }),
    });
  };

  useKeys(Layer.overlay, (input, key) => {
    if (key.escape) closeOverlay(spec);
    else if (list.handleKey(input, key)) return true;
    else if (input === ' ') {
      const file = files[list.index];
      if (file) toggle(file.path);
    } else if (input === 'a') setExcluded(selected.length === files.length ? new Set(files.map((file) => file.path)) : new Set());
    else if (key.return) proceed();
    return true;
  });

  const context = state.data;
  const onTaskBranch = context ? context.currentBranch === task.branch && task.branch !== null : true;
  return (
    <OverlayFrame
      title="Commit"
      context={`${task.ref} · ${selected.length}/${files.length} selected`}
      hints={[
        ['j/k', 'move'],
        ['space', 'toggle'],
        ['a', 'all/none'],
        ['enter', 'message'],
        ['esc', 'cancel'],
      ]}
    >
      {state.error ? (
        <Box flexDirection="column">
          <Text color={palette.danger}>{`${symbols.cross} ${state.error.message}`}</Text>
          {state.error.hint ? <Text dimColor>{`  ${state.error.hint}`}</Text> : null}
        </Box>
      ) : null}
      {context && !onTaskBranch ? (
        <Text color={palette.warning}>
          {`${symbols.cross} You are on ${context.currentBranch ?? 'a detached HEAD'}, not on ${task.branch ?? 'the task branch'}. Press b in the task first.`}
        </Text>
      ) : null}
      {context?.merging ? <Text color={palette.warning}>A merge is in progress in this repository.</Text> : null}
      {context && files.length === 0 ? <Text dimColor>Nothing to commit. The working tree is clean.</Text> : null}
      {files.slice(list.offset, list.offset + height).map((file, position) => {
        const index = list.offset + position;
        const kind = KIND[file.kind];
        const checked = !excluded.has(file.path);
        return (
          <Box key={file.path} gap={1}>
            <Text color={palette.accent}>{index === list.index ? symbols.pointer : ' '}</Text>
            <Text color={checked ? palette.accent : undefined} dimColor={!checked}>
              {checked ? '[x]' : '[ ]'}
            </Text>
            <Text color={kind.color}>{kind.letter}</Text>
            <Text dimColor={!checked} bold={index === list.index} wrap="truncate-end">
              {file.previousPath ? `${file.previousPath} ${symbols.arrow} ${file.path}` : file.path}
            </Text>
          </Box>
        );
      })}
    </OverlayFrame>
  );
}
