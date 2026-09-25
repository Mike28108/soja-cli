import { Box, Text } from 'ink';
import { useAppState } from '../app-state.js';
import { useFlows } from '../hooks/use-flows.js';
import { useLayout } from '../hooks/use-layout.js';
import { useList } from '../hooks/use-list.js';
import { useQuery } from '../hooks/use-query.js';
import { Layer } from '../input/dispatcher.js';
import { useKeys } from '../input/KeyProvider.js';
import { palette, symbols } from '../theme/theme.js';
import { Badge } from '../kit/Badge.js';
import { Clickable } from '../kit/Clickable.js';
import { Panel } from '../kit/Panel.js';
import { ScreenFrame } from './ScreenFrame.js';

export function WorkspacesScreen({ active }: { active: boolean }) {
  const { services, session } = useAppState();
  const { height, width } = useLayout();
  const data = useQuery(async () => {
    const [workspaces, members] = await Promise.all([
      services.workspaces.list(session.user),
      services.workspaces.members(session),
    ]);
    return { workspaces, members };
  }, `workspaces:${session.workspace.id}`);
  const workspaces = data.data?.workspaces ?? [];
  const members = data.data?.members ?? [];
  const listRows = Math.max(3, Math.min(workspaces.length, height - 6 - Math.min(members.length, 8)));
  const list = useList(workspaces.length, listRows, true, Math.max(0, workspaces.findIndex((w) => w.id === session.workspace.id)));

  const flows = useFlows();

  useKeys(
    Layer.screen,
    (input, key) => {
      if (list.handleKey(input, key)) return true;
      if (key.ctrl || key.meta) return false;
      const workspace = workspaces[list.index];
      if (key.return && workspace) void flows.switchWorkspace(workspace.id);
      else if (input === 'n') flows.newWorkspace();
      else if (input === 'a') flows.addDeveloper();
      else return false;
      return true;
    },
    active,
  );

  const wide = width >= 80;
  return (
    <ScreenFrame
      title="Workspaces"
      aside={`${workspaces.length} workspace${workspaces.length === 1 ? '' : 's'}`}
      hints={[
        ['↑↓', 'move'],
        ['enter', 'switch'],
        ['n', 'new workspace'],
        ['a', 'add developer'],
        ['esc', 'back'],
      ]}
    >
      <Box flexDirection={wide ? 'row' : 'column'} gap={1}>
        <Panel title="Your workspaces" flexGrow={1}>
          {workspaces.slice(list.offset, list.offset + listRows).map((workspace, position) => {
            const index = list.offset + position;
            const selected = index === list.index;
            const current = workspace.id === session.workspace.id;
            const bg = selected ? { backgroundColor: palette.selection } : {};
            return (
              <Clickable
                key={workspace.id}
                active={active}
                onClick={() => (selected ? void flows.switchWorkspace(workspace.id) : list.select(index))}
              >
                <Box gap={1} flexGrow={1} {...bg}>
                  <Text color={palette.accent}>{selected ? symbols.pointer : ' '}</Text>
                  <Text color={palette.text} bold={selected} wrap="truncate-end">
                    {workspace.name}
                  </Text>
                  <Text color={palette.muted} wrap="truncate-end">{`${workspace.slug} ${symbols.dot} ${workspace.role}`}</Text>
                  {current ? <Badge tone="success">current</Badge> : null}
                </Box>
              </Clickable>
            );
          })}
        </Panel>
        <Panel title={`Developers in ${session.workspace.name}`} aside={`${members.length}`} width={wide ? Math.floor(width * 0.45) : undefined} flexShrink={0}>
          {members.slice(0, 10).map((member) => (
            <Box key={member.id} gap={1}>
              <Text backgroundColor={palette.neutralSoft} color={palette.accent} bold>{` ${initials(member.displayName)} `}</Text>
              <Text color={palette.text}>{`@${member.username}`}</Text>
              <Text color={palette.muted} wrap="truncate-end">
                {member.displayName}
              </Text>
              {member.role === 'owner' ? <Badge tone="info">owner</Badge> : null}
            </Box>
          ))}
          {members.length > 10 ? <Text color={palette.faint}>{`${symbols.ellipsis} and ${members.length - 10} more`}</Text> : null}
          <Box marginTop={1}>
            <Text color={palette.faint}>a adds a developer</Text>
          </Box>
        </Panel>
      </Box>
    </ScreenFrame>
  );
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '?') + (parts[1]?.[0] ?? '')).toUpperCase();
}
