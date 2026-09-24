import { Box, Text } from 'ink';
import { useState, type ReactNode } from 'react';
import { TASK_PRIORITIES, TASK_TYPES, type TaskPriority, type TaskType } from '../../domain/task.js';
import { useAppState } from '../app-state.js';
import { TextInput } from '../components/TextInput.js';
import { useQuery } from '../hooks/use-query.js';
import { Layer } from '../input/dispatcher.js';
import { useKeys } from '../input/KeyProvider.js';
import { palette, symbols } from '../theme/theme.js';
import { memberOptions, priorityOptions, projectOptions, NONE, typeOptions, fromOption } from './options.js';
import { OverlayFrame } from './OverlayFrame.js';
import { completeFrom } from './PromptOverlay.js';
import type { Overlay, PickerOption } from './types.js';

type Field = 'title' | 'project' | 'type' | 'priority' | 'assignee' | 'requester';
const FIELDS: Field[] = ['title', 'project', 'type', 'priority', 'assignee', 'requester'];
const LABELS: Record<Field, string> = {
  title: 'Title',
  project: 'Project',
  type: 'Type',
  priority: 'Priority',
  assignee: 'Assignee',
  requester: 'Requested by',
};

/**
 * Quick capture. Only the title is required and Enter creates from any
 * field, so "type title, Enter" is the whole flow when defaults are fine.
 */
export function NewTaskOverlay({ spec }: { spec: Extract<Overlay, { kind: 'new-task' }> }) {
  const { services, session, closeOverlay, run } = useAppState();
  const context = useQuery(async () => {
    const [projects, members, requesters] = await Promise.all([
      services.projects.list(session),
      services.workspaces.members(session),
      services.tasks.knownRequesters(session),
    ]);
    return { projects: projectOptions(projects), members: memberOptions(members, session.user.id), requesters };
  }, `new-task:${session.workspace.id}`);

  const [focus, setFocus] = useState<Field>('title');
  const [title, setTitle] = useState('');
  const [requester, setRequester] = useState('');
  const [projectId, setProjectId] = useState(spec.projectId ?? NONE);
  const [type, setType] = useState<TaskType>('feature');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [assigneeId, setAssigneeId] = useState(session.user.id);
  const [busy, setBusy] = useState(false);

  const projects = context.data?.projects ?? [];
  const members = context.data?.members ?? [];
  const requesters = context.data?.requesters ?? [];
  const completion = focus === 'requester' ? completeFrom(requester, requesters) : null;

  const create = async () => {
    if (busy) return;
    setBusy(true);
    const created = await run(
      () =>
        services.tasks.create(session, {
          title,
          projectId: fromOption(projectId),
          type,
          priority,
          assigneeId: fromOption(assigneeId),
          requester,
        }),
      `Task created: ${title.trim()}`,
    );
    setBusy(false);
    if (created) closeOverlay(spec);
  };

  const cycle = <T extends string>(values: readonly T[], current: T, step: number): T =>
    values[(values.indexOf(current) + step + values.length) % values.length] ?? current;
  const cycleOption = (options: readonly PickerOption[], current: string, step: number) =>
    cycle(
      options.map((option) => option.value),
      current,
      step,
    );

  const moveFocus = (step: number) => setFocus(cycle(FIELDS, focus, step));

  useKeys(Layer.overlay, (input, key) => {
    if (key.escape) closeOverlay(spec);
    else if (key.return) void create();
    else if (key.tab && completion) setRequester(completion);
    else if ((key.tab && !key.shift) || key.downArrow) moveFocus(1);
    else if ((key.tab && key.shift) || key.upArrow) moveFocus(-1);
    else if (key.leftArrow || key.rightArrow || input === ' ' || input === 'h' || input === 'l') {
      const step = key.leftArrow || input === 'h' ? -1 : 1;
      if (focus === 'project') setProjectId(cycleOption(projects, projectId, step));
      if (focus === 'type') setType(cycle(TASK_TYPES, type, step));
      if (focus === 'priority') setPriority(cycle([...TASK_PRIORITIES].reverse(), priority, step));
      if (focus === 'assignee') setAssigneeId(cycleOption(members, assigneeId, step));
    }
    return true;
  });

  const option = (options: readonly PickerOption[], value: string) => options.find((candidate) => candidate.value === value);
  const choice = (field: Field, picked: PickerOption | undefined) => (
    <Text>
      {focus === field ? <Text color={palette.accent}>‹ </Text> : <Text>  </Text>}
      <Text color={picked?.color} dimColor={picked?.dim} bold={focus === field}>
        {picked?.label ?? '—'}
      </Text>
      {focus === field ? <Text color={palette.accent}> ›</Text> : null}
      {picked?.hint && focus === field ? <Text dimColor>{`  ${picked.hint}`}</Text> : null}
    </Text>
  );

  const rows: Record<Field, ReactNode> = {
    title: <TextInput value={title} onChange={setTitle} active={focus === 'title'} placeholder="What needs to happen?" />,
    project: choice('project', option(projects, projectId)),
    type: choice('type', option(typeOptions, type)),
    priority: choice('priority', option(priorityOptions, priority)),
    assignee: choice('assignee', option(members, assigneeId)),
    requester: (
      <Text>
        <TextInput value={requester} onChange={setRequester} active={focus === 'requester'} placeholder={requesters[0] ?? 'Marketing, Finance…'} />
        {completion ? <Text dimColor>{`  tab → ${completion}`}</Text> : null}
      </Text>
    ),
  };

  return (
    <OverlayFrame
      title="New task"
      context={session.workspace.name}
      hints={[
        ['enter', 'create'],
        ['tab/↓', 'next field'],
        ['←/→', 'change'],
        ['esc', 'cancel'],
      ]}
    >
      {FIELDS.map((field) => (
        <Box key={field}>
          <Box width={15}>
            <Text color={focus === field ? palette.accent : undefined} dimColor={focus !== field}>
              {focus === field ? `${symbols.pointer} ` : '  '}
              {LABELS[field]}
            </Text>
          </Box>
          {rows[field]}
        </Box>
      ))}
      <Box marginTop={1}>
        <Text dimColor>  Only the title is required.</Text>
      </Box>
    </OverlayFrame>
  );
}
