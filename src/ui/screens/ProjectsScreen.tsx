import { basename } from 'node:path';
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
import { Clickable } from '../kit/Clickable.js';
import { Gauge } from '../kit/Gauge.js';
import { ScreenFrame } from './ScreenFrame.js';

export function ProjectsScreen({ active }: { active: boolean }) {
  const { services, session, go } = useAppState();
  const { width, height } = useLayout();
  const query = useQuery(() => services.projects.list(session), `projects:${session.workspace.id}`, [`projects:${session.workspace.id}`, `tasks:${session.workspace.id}`]);
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
      else if (input === 'r' && project) void flows.pickRepository(project);
      else if (input === 'e' && project) flows.editProject(project);
      else return false;
      return true;
    },
    active,
  );

  const wide = width >= 88;
  // Fixed columns: pointer, key, active; then progress, review, blocked, done gauge and repo when wide.
  const nameWidth = Math.max(10, width - 2 - 9 - 8 - (wide ? 10 + 8 + 9 + 17 + 16 : 0) - 1);
  return (
    <ScreenFrame
      title="Projects"
      aside={projects.length ? `${projects.length} project${projects.length === 1 ? '' : 's'}` : undefined}
      hints={[
        ['↑↓', 'move'],
        ['enter', 'open'],
        ['n', 'new project'],
        ['r', 'link repo'],
        ['e', 'edit'],
        ['esc', 'back'],
      ]}
    >
      {projects.length === 0 && !query.loading ? (
        <EmptyState lines={EMPTY_PROJECTS} icon={symbols.dot} />
      ) : (
        <Clickable onWheel={(direction) => list.select(list.index + direction)} active={active} flexDirection="column">
          <Box>
            <Box width={2} />
            <Header width={9} text="KEY" />
            <Box width={nameWidth} flexShrink={0}>
              <Text color={palette.faint} bold>
                NAME
              </Text>
            </Box>
            <Header width={8} text="ACTIVE" right />
            {wide ? (
              <>
                <Header width={10} text="PROGRESS" right />
                <Header width={8} text="REVIEW" right />
                <Header width={9} text="BLOCKED" right />
                <Box width={17} paddingLeft={3}>
                  <Text color={palette.faint} bold>
                    DONE
                  </Text>
                </Box>
                <Box width={16} paddingLeft={2}>
                  <Text color={palette.faint} bold>
                    REPO
                  </Text>
                </Box>
              </>
            ) : null}
          </Box>
          {projects.slice(list.offset, list.offset + rows - 1).map((project, position) => {
            const index = list.offset + position;
            const selected = index === list.index;
            const bg = selected ? { backgroundColor: palette.selection } : {};
            const total = Object.values(project.counts).reduce((sum, count) => sum + count, 0);
            return (
              <Clickable
                key={project.id}
                active={active}
                onClick={() => (selected ? go({ type: 'push', route: { name: 'project', projectId: project.id } }) : list.select(index))}
              >
                <Box flexGrow={1} {...bg}>
                  <Box width={2}>
                    <Text color={palette.accent}>{selected ? symbols.pointer : ' '}</Text>
                  </Box>
                  <Box width={9}>
                    <Text color={selected ? palette.accent : palette.muted} bold={selected}>
                      {project.key}
                    </Text>
                  </Box>
                  <Box width={nameWidth} flexShrink={0}>
                    <Text color={palette.text} bold={selected} wrap="truncate-end">
                      {project.name}
                    </Text>
                  </Box>
                  <Count width={8} value={project.active} color={palette.text} />
                  {wide ? (
                    <>
                      <Count width={10} value={project.counts.in_progress} color={palette.warning} />
                      <Count width={8} value={project.counts.review} color={palette.info} />
                      <Count width={9} value={project.counts.blocked} color={palette.danger} />
                      <Box width={17} paddingLeft={3}>
                        <Gauge value={project.counts.done} total={total} width={8} />
                      </Box>
                      <Box width={16} paddingLeft={2}>
                        <Text color={project.repositoryPath ? palette.muted : palette.faint} wrap="truncate-end">
                          {project.repositoryPath ? basename(project.repositoryPath) : 'not linked · r'}
                        </Text>
                      </Box>
                    </>
                  ) : null}
                </Box>
              </Clickable>
            );
          })}
        </Clickable>
      )}
    </ScreenFrame>
  );
}

function Header({ width, text, right = false }: { width: number; text: string; right?: boolean }) {
  return (
    <Box width={width} justifyContent={right ? 'flex-end' : 'flex-start'}>
      <Text color={palette.faint} bold>
        {text}
      </Text>
    </Box>
  );
}

function Count({ width, value, color }: { width: number; value: number; color?: string }) {
  return (
    <Box width={width} justifyContent="flex-end">
      <Text color={value ? color : palette.faint}>
        {value ? String(value) : symbols.dot}
      </Text>
    </Box>
  );
}
