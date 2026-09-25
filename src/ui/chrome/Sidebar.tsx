import { Box, Text } from 'ink';
import { FILTER_LABELS, type TaskFilter } from '../../application/filters.js';
import { isClosed } from '../../domain/task.js';
import { useAppState } from '../app-state.js';
import { useQuery } from '../hooks/use-query.js';
import { Clickable } from '../kit/Clickable.js';
import type { Route } from '../navigation/routes.js';
import { palette, symbols } from '../theme/theme.js';

const VIEWS: readonly TaskFilter[] = ['mine', 'all', 'todo', 'in_progress', 'review', 'blocked', 'done'];
const VIEW_LABELS: Record<TaskFilter, string> = { ...FILTER_LABELS, mine: 'My work', all: 'All open' };

/**
 * Where everything is, always visible on wide terminals: the task views
 * with their counts, the chat channels, the projects. Everything is clickable;
 * the keyboard shortcuts stay the same.
 */
export function Sidebar({ width, height, active }: { width: number; height: number; active: boolean }) {
  const { services, session, route, go, homeFilter, setHomeFilter } = useAppState();
  const counts = useQuery(async () => {
    const [open, done] = await Promise.all([services.tasks.list(session, 'all'), services.tasks.list(session, 'done')]);
    const byView: Record<TaskFilter, number> = { mine: 0, all: open.length, todo: 0, in_progress: 0, review: 0, blocked: 0, done: done.length, archived: 0 };
    for (const task of open) {
      if (task.assigneeId === session.user.id && !isClosed(task.status)) byView.mine += 1;
      if (task.status === 'todo' || task.status === 'in_progress' || task.status === 'review' || task.status === 'blocked') byView[task.status] += 1;
    }
    return byView;
  }, `sidebar-counts:${session.workspace.id}`);
  const projects = useQuery(() => services.projects.list(session), `sidebar-projects:${session.workspace.id}`);
  const chat = services.chat;
  const channels = useQuery(async () => (chat ? chat.channels(session) : []), `sidebar-channels:${session.workspace.id}`);

  const onHome = route.name === 'home';
  const openView = (filter: TaskFilter) => {
    setHomeFilter(filter);
    go({ type: 'reset' });
  };
  const open = (next: Route) => go({ type: 'reset', route: next });

  const openChannels = (channels.data ?? []).filter((channel) => !channel.archivedAt);
  // Leave room for the sections that follow; long lists are cut with a "more" line.
  const projectRows = Math.max(1, height - VIEWS.length - 8 - (chat ? Math.min(openChannels.length, 5) + 2 : 0));

  return (
    <Box flexDirection="column" width={width} height={height} flexShrink={0} paddingX={1} overflow="hidden">
      <Section title="TASKS" />
      {VIEWS.map((view) => (
        <Item
          key={view}
          label={VIEW_LABELS[view]}
          count={counts.data?.[view]}
          selected={onHome && homeFilter === view}
          onClick={() => openView(view)}
          active={active}
        />
      ))}
      {chat ? (
        <>
          <Section title="CHAT" />
          {openChannels.slice(0, 5).map((channel) => (
            <Item
              key={channel.id}
              label={`#${channel.name}`}
              count={channel.unread || undefined}
              highlight={channel.mentions > 0 ? 'mention' : channel.unread > 0 ? 'unread' : undefined}
              selected={route.name === 'chat' && route.channel === channel.name}
              onClick={() => open({ name: 'chat', channel: channel.name })}
              active={active}
            />
          ))}
        </>
      ) : null}
      <Section title="PROJECTS" />
      {(projects.data ?? []).slice(0, projectRows).map((project) => (
        <Item
          key={project.id}
          label={project.name}
          count={project.active || undefined}
          selected={route.name === 'project' && route.projectId === project.id}
          onClick={() => open({ name: 'project', projectId: project.id })}
          active={active}
        />
      ))}
      {(projects.data?.length ?? 0) > projectRows ? (
        <Item label={`${symbols.ellipsis} all projects`} selected={route.name === 'projects'} onClick={() => open({ name: 'projects' })} active={active} muted />
      ) : null}
      {(projects.data?.length ?? 0) === 0 && !projects.loading ? <Text color={palette.faint}>{'  none yet · p'}</Text> : null}
    </Box>
  );
}

function Section({ title }: { title: string }) {
  return (
    <Box marginTop={1}>
      <Text color={palette.faint} bold>
        {title}
      </Text>
    </Box>
  );
}

function Item({
  label,
  count,
  selected,
  onClick,
  active,
  highlight,
  muted = false,
}: {
  label: string;
  count?: number | undefined;
  selected: boolean;
  onClick: () => void;
  active: boolean;
  highlight?: 'unread' | 'mention' | undefined;
  muted?: boolean;
}) {
  const background = selected ? { backgroundColor: palette.selection } : {};
  const countColor = highlight === 'mention' ? palette.warning : highlight === 'unread' ? palette.accent : palette.faint;
  return (
    <Clickable onClick={onClick} active={active}>
      <Box justifyContent="space-between" flexGrow={1} {...background}>
        <Text wrap="truncate-end" {...background}>
          <Text color={palette.accent}>{selected ? symbols.pointer : ' '}</Text>
          <Text color={selected ? palette.text : muted ? palette.muted : palette.barText} bold={selected}>
            {label}
          </Text>
        </Text>
        {count !== undefined ? (
          <Text {...background} color={countColor} bold={Boolean(highlight)}>{`${count} `}</Text>
        ) : null}
      </Box>
    </Clickable>
  );
}
