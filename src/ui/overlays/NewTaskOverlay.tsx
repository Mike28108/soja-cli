import { Box, Text } from 'ink';
import { useState, type ReactNode } from 'react';
import { TASK_PRIORITIES, TASK_TYPES, type TaskPriority, type TaskType } from '../../domain/task.js';
import { useAppState } from '../app-state.js';
import { TextField } from '../components/TextField.js';
import { Button } from '../kit/Button.js';
import { Clickable } from '../kit/Clickable.js';
import { useQuery } from '../hooks/use-query.js';
import { Layer } from '../input/dispatcher.js';
import { useKeys } from '../input/KeyProvider.js';
import { palette, symbols, toneColors } from '../theme/theme.js';
import { memberOptions, priorityOptions, projectOptions, NONE, typeOptions, fromOption } from './options.js';
import { OverlayFrame } from './OverlayFrame.js';
import { completeFrom } from './PromptOverlay.js';
import type { Overlay, PickerOption } from './types.js';

type Field = 'title' | 'project' | 'repository' | 'type' | 'priority' | 'assignee' | 'requester';
const FIELDS: Field[] = ['title', 'project', 'repository', 'type', 'priority', 'assignee', 'requester'];
const LABELS: Record<Field, string> = {
  title: 'Title',
  project: 'Project',
  repository: 'Repository',
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
    return { projectRows: projects, projects: projectOptions(projects), members: memberOptions(members, session.user.id), requesters };
  }, `new-task:${session.workspace.id}`);

  const [focus, setFocus] = useState<Field>('title');
  const [title, setTitle] = useState('');
  const [requester, setRequester] = useState('');
  const [projectId, setProjectId] = useState(spec.projectId ?? NONE);
  const [repositoryId, setRepositoryId] = useState(NONE);
  const [type, setType] = useState<TaskType>('feature');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [assigneeId, setAssigneeId] = useState(session.user.id);
  const [busy, setBusy] = useState(false);

  const projects = context.data?.projects ?? [];
  const members = context.data?.members ?? [];
  const requesters = context.data?.requesters ?? [];
  const repositories = context.data?.projectRows.find((project) => project.id === projectId)?.repositories ?? [];
  const repositoryOptions: PickerOption[] = [{ value: NONE, label: 'Any repository', dim: true }, ...repositories.map((repository) => ({ value: repository.id, label: repository.name, hint: repository.localPath ?? repository.repositoryUrl ?? undefined }))];
  const completion = focus === 'requester' ? completeFrom(requester, requesters) : null;

  const create = async () => {
    if (busy) return;
    setBusy(true);
    const created = await run(
      () =>
        services.tasks.create(session, {
          title,
          projectId: fromOption(projectId),
          repositoryId: fromOption(repositoryId),
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

  const moveFocus = (direction: number) => setFocus(cycle(FIELDS, focus, direction));
  const step = (field: Field, direction: number) => {
    if (field === 'project') { setProjectId(cycleOption(projects, projectId, direction)); setRepositoryId(NONE); }
    if (field === 'repository') setRepositoryId(cycleOption(repositoryOptions, repositoryId, direction));
    if (field === 'type') setType(cycle(TASK_TYPES, type, direction));
    if (field === 'priority') setPriority(cycle([...TASK_PRIORITIES].reverse(), priority, direction));
    if (field === 'assignee') setAssigneeId(cycleOption(members, assigneeId, direction));
  };


  useKeys(Layer.overlay, (input, key) => {
    if (key.escape) closeOverlay(spec);
    else if (key.return) void create();
    else if (key.tab && completion) setRequester(completion);
    else if ((key.tab && !key.shift) || key.downArrow) moveFocus(1);
    else if ((key.tab && key.shift) || key.upArrow) moveFocus(-1);
    else if (focus !== 'title' && focus !== 'requester' && (key.leftArrow || key.rightArrow || input === ' ' || input === 'h' || input === 'l')) {
      step(focus, key.leftArrow || input === 'h' ? -1 : 1);
    }
    return true;
  });

  const option = (options: readonly PickerOption[], value: string) => options.find((candidate) => candidate.value === value);
  /** `‹ Feature ›`: a value you change with ←/→ or by clicking it. */
  const choice = (field: Field, picked: PickerOption | undefined) => {
    const focused = focus === field;
    const color = picked?.tone ? toneColors(picked.tone).fg : picked?.dim ? palette.muted : palette.text;
    return (
      <Clickable onClick={() => (focused ? step(field, 1) : setFocus(field))} layer={Layer.overlay}>
        <Text backgroundColor={focused ? palette.selection : palette.neutralSoft}>
          <Text color={focused ? palette.accent : palette.faint}>{' ‹ '}</Text>
          <Text color={color} bold={focused}>
            {picked?.label ?? '—'}
          </Text>
          <Text color={focused ? palette.accent : palette.faint}>{' › '}</Text>
        </Text>
        {picked?.hint && focused ? <Text color={palette.muted}>{`  ${picked.hint}`}</Text> : null}
      </Clickable>
    );
  };

  const rows: Record<Field, ReactNode> = {
    title: <TextField value={title} onChange={setTitle} active={focus === 'title'} placeholder="What needs to happen?" width={46} />,
    project: choice('project', option(projects, projectId)),
    repository: choice('repository', option(repositoryOptions, repositoryId)),
    type: choice('type', option(typeOptions, type)),
    priority: choice('priority', option(priorityOptions, priority)),
    assignee: choice('assignee', option(members, assigneeId)),
    requester: (
      <Box>
        <TextField value={requester} onChange={setRequester} active={focus === 'requester'} placeholder={requesters[0] ?? 'Marketing, Finance…'} width={30} />
        {completion ? <Text color={palette.muted}>{`  tab → ${completion}`}</Text> : null}
      </Box>
    ),
  };

  return (
    <OverlayFrame
      title="New task"
      context={session.workspace.name}
      width={70}
      hints={[
        ['enter', 'create'],
        ['tab ↓', 'next field'],
        ['←→', 'change'],
        ['esc', 'cancel'],
      ]}
    >
      {FIELDS.map((field) => (
        <Clickable key={field} onClick={() => setFocus(field)} layer={Layer.overlay}>
          <Box marginBottom={field === 'title' ? 1 : 0} flexGrow={1}>
            <Box width={15} flexShrink={0}>
              <Text color={focus === field ? palette.accent : palette.muted} bold={focus === field}>
                {focus === field ? `${symbols.pointer} ` : '  '}
                {LABELS[field]}
              </Text>
            </Box>
            {rows[field]}
          </Box>
        </Clickable>
      ))}
      <Box marginTop={1} justifyContent="space-between">
        <Text color={palette.faint}>Only the title is required.</Text>
        <Box gap={2}>
          <Button label="Cancel" onPress={() => closeOverlay(spec)} />
          <Button label="Create task" variant="primary" onPress={() => void create()} />
        </Box>
      </Box>
    </OverlayFrame>
  );
}
