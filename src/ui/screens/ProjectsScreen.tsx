import { Box, Text } from 'ink';
import { useAppState } from '../app-state.js';
import { EmptyState } from '../components/EmptyState.js';
import { EMPTY_PROJECTS } from '../copy.js';
import { useFlows } from '../hooks/use-flows.js';
import { useLayout } from '../hooks/use-layout.js';
import { useList } from '../hooks/use-list.js';
import { useQuery } from '../hooks/use-query.js';
import { Layer } from '../input/dispatcher.js';
import { useKeys } from '../input/KeyProvider.js';
import { palette, symbols } from '../theme/theme.js';
import { ScreenFrame } from './ScreenFrame.js';

export function ProjectsScreen({ active }: { active: boolean }) {
  const { services, session, go } = useAppState();
  const { width, height } = useLayout();
  const query = useQuery(() => services.projects.list(session), `projects:${session.workspace.id}`);
  const projects = query.data ?? [];
  const rows = Math.max(1, height - 3);
  const list = useList(projects.length, rows);

  const flows = useFlows();

  useKeys(
    Layer.screen,
    (input, key) => {
      if (list.handleKey(input, key)) return true;
      if (key.ctrl || key.meta) return false;
      const project = projects[list.index];
      if (key.return && project) go({ type: 'push', route: { name: 'project', projectId: project.id } });
      else if (input === 'n') flows.newProject();
      else return false;
      return true;
    },
    active,
  );

  const wide = width >= 70;
  return (
    <ScreenFrame
      hints={[
        ['j/k', 'move'],
        ['enter', 'open'],
        ['n', 'new project'],
        ['esc', 'back'],
      ]}
    >
      <Text bold>PROJECTS</Text>
      {projects.length === 0 && !query.loading ? (
        <EmptyState lines={EMPTY_PROJECTS} />
      ) : (
        <Box marginTop={1} flexDirection="column">
          <Box>
            <Box width={2} />
            <Box width={9}>
              <Text dimColor>KEY</Text>
            </Box>
            <Box flexGrow={1}>
              <Text dimColor>NAME</Text>
            </Box>
            <Box width={8} justifyContent="flex-end">
              <Text dimColor>ACTIVE</Text>
            </Box>
            {wide ? (
              <>
                <Box width={10} justifyContent="flex-end">
                  <Text dimColor>PROGRESS</Text>
                </Box>
                <Box width={8} justifyContent="flex-end">
                  <Text dimColor>REVIEW</Text>
                </Box>
                <Box width={9} justifyContent="flex-end">
                  <Text dimColor>BLOCKED</Text>
                </Box>
              </>
            ) : null}
          </Box>
          {projects.slice(list.offset, list.offset + rows - 1).map((project, position) => {
            const selected = list.offset + position === list.index;
            return (
              <Box key={project.id}>
                <Box width={2}>
                  <Text color={palette.accent}>{selected ? symbols.pointer : ' '}</Text>
                </Box>
                <Box width={9}>
                  <Text dimColor={!selected} color={selected ? palette.accent : undefined}>
                    {project.key}
                  </Text>
                </Box>
                <Box flexGrow={1}>
                  <Text bold={selected} wrap="truncate-end">
                    {project.name}
                  </Text>
                </Box>
                <Count width={8} value={project.active} />
                {wide ? (
                  <>
                    <Count width={10} value={project.counts.in_progress} color={palette.warning} />
                    <Count width={8} value={project.counts.review} color={palette.info} />
                    <Count width={9} value={project.counts.blocked} color={palette.danger} />
                  </>
                ) : null}
              </Box>
            );
          })}
        </Box>
      )}
    </ScreenFrame>
  );
}

function Count({ width, value, color }: { width: number; value: number; color?: string }) {
  return (
    <Box width={width} justifyContent="flex-end">
      <Text color={value ? color : undefined} dimColor={!value}>
        {value ? String(value) : symbols.dot}
      </Text>
    </Box>
  );
}
