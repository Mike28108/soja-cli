import { Box, Text } from 'ink';
import { useAppState } from '../app-state.js';
import { useFlows } from '../hooks/use-flows.js';
import { useLayout } from '../hooks/use-layout.js';
import { useList } from '../hooks/use-list.js';
import { useQuery } from '../hooks/use-query.js';
import { Layer } from '../input/dispatcher.js';
import { useKeys } from '../input/KeyProvider.js';
import { palette, symbols } from '../theme/theme.js';
import { ScreenFrame } from './ScreenFrame.js';

export function WorkspacesScreen({ active }: { active: boolean }) {
  const { services, session } = useAppState();
  const { height } = useLayout();
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

  return (
    <ScreenFrame
      hints={[
        ['j/k', 'move'],
        ['enter', 'switch'],
        ['n', 'new workspace'],
        ['a', 'add developer'],
        ['esc', 'back'],
      ]}
    >
      <Text bold>WORKSPACES</Text>
      <Box marginTop={1} flexDirection="column">
        {workspaces.slice(list.offset, list.offset + listRows).map((workspace, position) => {
          const selected = list.offset + position === list.index;
          const current = workspace.id === session.workspace.id;
          return (
            <Box key={workspace.id} gap={1}>
              <Text color={palette.accent}>{selected ? symbols.pointer : ' '}</Text>
              <Text color={palette.accent}>{current ? symbols.active : ' '}</Text>
              <Text bold={selected}>{workspace.name}</Text>
              <Text dimColor>{`${workspace.slug} ${symbols.dot} ${workspace.role}`}</Text>
            </Box>
          );
        })}
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text dimColor bold>{`DEVELOPERS IN ${session.workspace.name.toUpperCase()}`}</Text>
        {members.slice(0, 8).map((member) => (
          <Text key={member.id}>
            <Text>{`  @${member.username}`}</Text>
            <Text dimColor>{`  ${member.displayName}${member.role === 'owner' ? ` ${symbols.dot} owner` : ''}`}</Text>
          </Text>
        ))}
        {members.length > 8 ? <Text dimColor>{`  ${symbols.ellipsis} and ${members.length - 8} more`}</Text> : null}
      </Box>
    </ScreenFrame>
  );
}
