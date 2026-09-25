import { Box, Text } from 'ink';
import { useEffect, useRef, useState } from 'react';
import type { ChannelSummary, ChatOperations, MessageView } from '../../application/chat.js';
import { taskRefsIn } from '../../domain/chat.js';
import { formatTaskRef } from '../../domain/task.js';
import { formatStamp } from '../../utils/time.js';
import { terminalSafe, wrapText } from '../../utils/text.js';
import { useAppState } from '../app-state.js';
import { EmptyState } from '../components/EmptyState.js';
import { useLayout } from '../hooks/use-layout.js';
import { useQuery } from '../hooks/use-query.js';
import { Layer } from '../input/dispatcher.js';
import { useKeys } from '../input/KeyProvider.js';
import { editText, type TextState } from '../input/text-editing.js';
import { palette, symbols } from '../theme/theme.js';
import { ScreenFrame } from './ScreenFrame.js';

/** Channel list beside the messages from this width on. */
const WIDE = 100;
const SIDEBAR = 24;
const COMPOSER_LINES = 4;
const TOPIC = '__topic__';
const ARCHIVE = '__archive__';
const EMPTY_DRAFT: TextState = { value: '', cursor: 0 };

type Focus = 'input' | 'messages';

interface Row {
  key: string;
  /** Index of the message this row belongs to. */
  index: number;
  kind: 'quote' | 'first' | 'more';
  stamp: string;
  author: string;
  text: string;
}

export function ChatScreen({ active, initialChannel }: { active: boolean; initialChannel?: string }) {
  const { services } = useAppState();
  const chat = services.chat;
  if (!chat) {
    return (
      <ScreenFrame hints={[['esc', 'back']]}>
        <EmptyState lines={['The chat needs a team.', 'Sign in to a SOJA server with `soja login --server <url>`.']} />
      </ScreenFrame>
    );
  }
  return <Chat chat={chat} active={active} initialChannel={initialChannel} />;
}

function Chat({ chat, active, initialChannel }: { chat: ChatOperations; active: boolean; initialChannel: string | undefined }) {
  const { services, session, run, notify, refresh, openOverlay, go, syncStatus } = useAppState();
  const { width, height } = useLayout();
  const [channelId, setChannelId] = useState<string | null>(null);
  const [focus, setFocus] = useState<Focus>('input');
  const [draft, setDraft] = useState<TextState>(EMPTY_DRAFT);
  const [replyTo, setReplyTo] = useState<MessageView | null>(null);
  const [editing, setEditing] = useState<MessageView | null>(null);
  const [selected, setSelected] = useState(0);

  const channels = useQuery(() => chat.channels(session), `chat-channels:${session.workspace.id}`);
  const list = channels.data ?? [];
  const wanted = initialChannel?.replace(/^#/, '').toLowerCase();
  const channel = list.find((candidate) => candidate.id === channelId) ?? list.find((candidate) => candidate.name === wanted) ?? list[0] ?? null;
  const messages = useQuery(async () => (channel ? chat.messages(session, channel.id, 300) : []), `chat-messages:${channel?.id ?? ''}`);
  const items = messages.data ?? [];
  const members = useQuery(() => services.workspaces.members(session), `members:${session.workspace.id}`);
  const notices = useQuery(
    async () => ((await services.sync?.notices(session.workspace.id)) ?? []).filter((notice) => notice.field === 'chat'),
    `chat-notices:${session.workspace.id}`,
  );

  // Reading a channel marks it read (once per new message, not on every refresh).
  const marked = useRef(new Map<string, number>());
  const latestSeq = Math.max(0, ...items.map((message) => message.seq ?? 0));
  useEffect(() => {
    if (!active || !channel || latestSeq <= channel.lastReadSeq || (marked.current.get(channel.id) ?? 0) >= latestSeq) return;
    marked.current.set(channel.id, latestSeq);
    void chat.markRead(session, channel.id).then(refresh, () => undefined);
  }, [active, channel, latestSeq, chat, session, refresh]);

  const current = items[Math.min(selected, items.length - 1)];
  const switchTo = (next: ChannelSummary) => {
    setChannelId(next.id);
    setReplyTo(null);
    setEditing(null);
    setFocus('input');
  };
  const cycle = (step: number) => {
    const open = list.filter((candidate) => !candidate.archivedAt);
    const index = open.findIndex((candidate) => candidate.id === channel?.id);
    const next = open[(index + step + open.length) % open.length];
    if (next) switchTo(next);
  };

  const pickChannel = () =>
    openOverlay({
      kind: 'picker',
      title: 'Channels',
      filterable: true,
      initial: channel?.id ?? null,
      options: [
        ...list.map((candidate) => ({
          value: candidate.id,
          label: `#${candidate.name}`,
          ...(candidate.unread ? { hint: `${candidate.unread} unread${candidate.mentions ? ` ${symbols.dot} @${candidate.mentions}` : ''}` } : {}),
          ...(candidate.archivedAt ? { dim: true, hint: 'archived' } : {}),
        })),
        ...(channel
          ? [
              { value: TOPIC, label: `Topic of #${channel.name}…`, hint: channel.topic ?? 'none' },
              ...(channel.name === 'general'
                ? []
                : [{ value: ARCHIVE, label: channel.archivedAt ? `Restore #${channel.name}` : `Archive #${channel.name}`, hint: 'owners', dim: true }]),
            ]
          : []),
      ],
      onSelect: (value) => {
        if (value === TOPIC && channel) return editTopic(channel);
        if (value === ARCHIVE && channel) {
          const archived = !channel.archivedAt;
          return run(() => chat.updateChannel(session, channel.id, { archived }), archived ? `#${channel.name} archived` : `#${channel.name} restored`);
        }
        const next = list.find((candidate) => candidate.id === value);
        if (next) switchTo(next);
      },
      create: {
        label: (query) => `Create #${query.trim().toLowerCase().replace(/^#/, '')}`,
        onCreate: (query) => run(() => chat.createChannel(session, query).then((created) => setChannelId(created.id)), 'Channel created'),
      },
    });

  const editTopic = (target: ChannelSummary) =>
    openOverlay({
      kind: 'prompt',
      title: `Topic of #${target.name}`,
      initial: target.topic ?? '',
      placeholder: 'What this channel is for',
      allowEmpty: true,
      onSubmit: (topic) => run(() => chat.updateChannel(session, target.id, { topic: topic.trim() || null }), 'Topic saved'),
    });

  const reviewNotices = () => {
    const sync = services.sync;
    const pending = notices.data ?? [];
    if (!sync || pending.length === 0) return;
    openOverlay({
      kind: 'picker',
      title: 'Not applied',
      context: 'Chat',
      options: pending.flatMap((notice) => [
        ...(typeof notice.overwritten === 'string' ? [{ value: `restore:${notice.id}`, label: `Put the text back: ${oneLine(notice.overwritten)}` }] : []),
        { value: `dismiss:${notice.id}`, label: `Dismiss: ${notice.message}`, dim: true },
      ]),
      onSelect: (value) => {
        const [action, id] = value.split(':');
        const notice = pending.find((candidate) => candidate.id === id);
        if (!notice) return;
        if (action === 'restore' && typeof notice.overwritten === 'string') {
          setDraft({ value: notice.overwritten, cursor: notice.overwritten.length });
          setFocus('input');
        }
        return run(() => sync.dismissNotice(notice.id));
      },
    });
  };

  const submit = () => {
    const text = draft.value.trim();
    if (!text || !channel) return;
    const target = editing;
    const quoted = replyTo;
    setDraft(EMPTY_DRAFT);
    setReplyTo(null);
    setEditing(null);
    void run(() => (target ? chat.edit(session, target.id, text) : chat.send(session, channel.id, text, { replyToId: quoted?.id ?? null }))).then(
      (ok) => {
        // Keep what you wrote if it could not be queued.
        if (!ok) setDraft({ value: text, cursor: text.length });
      },
    );
  };

  /** `@an` + tab → `@angel `. Returns false when there is nothing to complete. */
  const complete = (): boolean => {
    const before = draft.value.slice(0, draft.cursor);
    const match = /@([\w.-]*)$/.exec(before);
    if (!match) return false;
    const prefix = (match[1] ?? '').toLowerCase();
    const names = (members.data ?? []).map((member) => member.username).filter((name) => name !== session.user.username && name.toLowerCase().startsWith(prefix));
    const [name] = names;
    if (!name) return true; // nothing matches; stay in the field
    const start = before.length - prefix.length;
    const value = `${draft.value.slice(0, start)}${name} ${draft.value.slice(draft.cursor)}`;
    setDraft({ value, cursor: start + name.length + 1 });
    return true;
  };

  const focusMessages = () => {
    if (items.length === 0) return;
    setSelected(items.length - 1);
    setFocus('messages');
  };

  useKeys(
    Layer.input,
    (input, key) => {
      if (key.return && key.meta) {
        setDraft(insert(draft, '\n'));
        return true;
      }
      if (key.return) {
        submit();
        return true;
      }
      if (key.tab) {
        if (!complete()) focusMessages();
        return true;
      }
      if (key.escape && (replyTo || editing)) {
        if (editing) setDraft(EMPTY_DRAFT);
        setReplyTo(null);
        setEditing(null);
        return true;
      }
      if (key.upArrow && !draft.value) {
        focusMessages();
        return true;
      }
      // A multi-line paste keeps its lines.
      if (input.length > 1 && /[\r\n]/.test(input) && !key.ctrl && !key.meta) {
        setDraft(insert(draft, terminalSafe(input)));
        return true;
      }
      const next = editText(draft, input, key);
      if (!next) return false;
      setDraft(next);
      return true;
    },
    active && focus === 'input',
  );

  const openTask = (message: MessageView) => {
    const refs = taskRefsIn(message.body).map(formatTaskRef);
    const [only] = refs;
    if (!only) notify('No task in this message.');
    else if (refs.length === 1) go({ type: 'push', route: { name: 'task', ref: only } });
    else {
      openOverlay({
        kind: 'picker',
        title: 'Open task',
        options: refs.map((ref) => ({ value: ref, label: ref })),
        onSelect: (ref) => go({ type: 'push', route: { name: 'task', ref } }),
      });
    }
  };

  useKeys(
    Layer.screen,
    (input, key) => {
      if (key.ctrl || key.meta) return false;
      if (focus === 'input') return false;
      const message = current;
      if (key.tab || input === 'i' || key.escape) setFocus('input');
      else if (input === 'j' || key.downArrow) {
        if (selected >= items.length - 1) setFocus('input');
        else setSelected(selected + 1);
      } else if (input === 'k' || key.upArrow) {
        if (selected > 0) setSelected(selected - 1);
        else if (channel) {
          void run(async () => {
            const count = await chat.loadOlder(session, channel.id);
            setSelected(count);
            if (count === 0) notify(`That is the beginning of #${channel.name}.`);
          });
        }
      } else if (input === '#') pickChannel();
      else if (input === ']') cycle(1);
      else if (input === '[') cycle(-1);
      else if (input === '!') reviewNotices();
      else if (!message || message.deletedAt) return false;
      else if (input === 'r') {
        setReplyTo(message);
        setEditing(null);
        setFocus('input');
      } else if (input === 'e') {
        if (!message.mine) notify('You can only edit your own messages.', 'error');
        else {
          setEditing(message);
          setReplyTo(null);
          setDraft({ value: message.body, cursor: message.body.length });
          setFocus('input');
        }
      } else if (input === 'd') {
        if (!message.mine) notify('You can only delete your own messages.', 'error');
        else {
          openOverlay({
            kind: 'picker',
            title: 'Delete this message?',
            context: oneLine(message.body),
            options: [
              { value: 'no', label: 'Cancel' },
              { value: 'yes', label: 'Delete for everyone', color: 'yellow' },
            ],
            onSelect: (value) => (value === 'yes' ? run(() => chat.remove(session, message.id), 'Message deleted') : undefined),
          });
        }
      } else if (input === 't') {
        let ref = '';
        void run(async () => {
          ref = (await chat.taskFromMessage(session, message.id)).ref;
        }).then((ok) => {
          if (ok) notify(`Created ${ref} from the message`, 'success');
        });
      } else if (key.return) openTask(message);
      else return false;
      return true;
    },
    active,
  );

  // ── Layout ───────────────────────────────────────────────────────────────
  const wide = width >= WIDE;
  const mainWidth = wide ? width - SIDEBAR - 2 : width;
  const composerLines = composerRows(draft, mainWidth - 2).slice(-COMPOSER_LINES);
  const noticeCount = notices.data?.length ?? 0;
  const banner = editing ? 'Editing your message' : replyTo ? `Replying to ${replyTo.author ? `@${replyTo.author.username}` : 'a message'}: ${oneLine(replyTo.body)}` : null;
  const areaRows = Math.max(3, height - 2 - composerLines.length - (banner ? 1 : 0) - (noticeCount ? 1 : 0));
  const rows = messageRows(items, mainWidth - 2);
  // Pinned to the newest message; scrolls up only as far as the selection needs.
  let start = Math.max(0, rows.length - areaRows);
  const firstSelected = focus === 'messages' ? rows.findIndex((row) => row.index === selected) : -1;
  if (firstSelected >= 0 && firstSelected < start) start = firstSelected;
  const visible = rows.slice(start, start + areaRows);

  const hints =
    focus === 'input'
      ? ([
          ['enter', editing ? 'save' : 'send'],
          ['alt+enter', 'new line'],
          ['tab', '@ complete / messages'],
          ['esc', replyTo || editing ? 'cancel' : 'back'],
        ] as const)
      : ([
          ...(noticeCount ? ([['!', `${noticeCount} not applied`]] as const) : []),
          ['r', 'reply'],
          ['t', 'task'],
          ['e', 'edit'],
          ['d', 'delete'],
          ['enter', 'open task'],
          ['#', 'channels'],
          ['tab', 'write'],
        ] as const);

  return (
    <ScreenFrame hints={hints}>
      <Box>
        {wide ? <Sidebar channels={list} current={channel?.id ?? null} /> : null}
        <Box flexDirection="column" width={mainWidth}>
          <Box justifyContent="space-between">
            <Text wrap="truncate-end">
              <Text bold color={palette.accent}>
                {channel ? `#${channel.name}` : '#'}
              </Text>
              {channel?.topic ? <Text dimColor>{`  ${channel.topic}`}</Text> : null}
              {channel?.archivedAt ? <Text dimColor>{'  archived'}</Text> : null}
            </Text>
            {syncStatus?.online === false ? <Text color={palette.warning}>offline · sent when you reconnect</Text> : !wide ? <Text dimColor>{'# channels'}</Text> : null}
          </Box>
          <Box flexDirection="column" height={areaRows} justifyContent="flex-end">
            {!channel ? (
              <Text dimColor>{channels.data ? 'No channels yet. They arrive with the first sync.' : 'Loading…'}</Text>
            ) : items.length === 0 ? (
              <Text dimColor>{`No messages in #${channel.name} yet. Say hi.`}</Text>
            ) : (
              visible.map((row) => <MessageRow key={row.key} row={row} message={items[row.index]} selected={focus === 'messages' && row.index === selected} />)
            )}
          </Box>
          {noticeCount ? (
            <Text color={palette.danger} wrap="truncate-end">{`! ${notices.data?.[0]?.message ?? ''}${noticeCount > 1 ? ` (+${noticeCount - 1})` : ''} ${symbols.dot} tab, then ! to review`}</Text>
          ) : null}
          {banner ? (
            <Text dimColor wrap="truncate-end">
              {`${symbols.reply} ${banner} ${symbols.dot} esc cancel`}
            </Text>
          ) : null}
          <Composer lines={composerLines} active={active && focus === 'input'} placeholder={channel ? `Message #${channel.name}` : 'Message'} />
        </Box>
      </Box>
    </ScreenFrame>
  );
}

function Sidebar({ channels, current }: { channels: readonly ChannelSummary[]; current: string | null }) {
  return (
    <Box flexDirection="column" width={SIDEBAR} marginRight={2} flexShrink={0}>
      <Text dimColor bold>
        CHANNELS
      </Text>
      {channels.map((channel) => {
        const here = channel.id === current;
        return (
          <Box key={channel.id} justifyContent="space-between">
            <Text wrap="truncate-end" color={here ? palette.accent : undefined} dimColor={Boolean(channel.archivedAt)} bold={here || channel.unread > 0}>
              {`${here ? symbols.pointer : ' '}#${channel.name}`}
            </Text>
            {channel.unread ? (
              <Text color={channel.mentions ? palette.warning : palette.accent}>{channel.mentions ? `@${channel.mentions}` : String(channel.unread)}</Text>
            ) : null}
          </Box>
        );
      })}
      <Text dimColor>{'[ ] switch  # all'}</Text>
    </Box>
  );
}

function MessageRow({ row, message, selected }: { row: Row; message: MessageView | undefined; selected: boolean }) {
  if (!message) return null;
  const pointer = <Text color={palette.accent}>{selected && row.kind !== 'quote' ? symbols.pointer : ' '}</Text>;
  if (row.kind === 'quote') {
    return (
      <Text wrap="truncate-end" dimColor>
        {` ${' '.repeat(row.stamp.length)}${row.text}`}
      </Text>
    );
  }
  const tone = message.deletedAt ? { dimColor: true, italic: true } : message.mentionsMe ? { color: palette.warning } : {};
  return (
    <Text wrap="truncate-end">
      {pointer}
      <Text dimColor>{row.stamp}</Text>
      <Text bold color={message.mine ? palette.accent : undefined}>
        {row.author}
      </Text>
      <Text {...tone}>{row.text}</Text>
      {row.kind === 'first' && message.pending ? <Text dimColor>{` ${symbols.pending}`}</Text> : null}
      {row.kind === 'first' && message.editedAt && !message.deletedAt ? <Text dimColor>{' (edited)'}</Text> : null}
    </Text>
  );
}

function Composer({ lines, active, placeholder }: { lines: { text: string; cursor: number | null }[]; active: boolean; placeholder: string }) {
  const empty = lines.length === 1 && lines[0]?.text === '';
  return (
    <Box flexDirection="column">
      {lines.map((line, index) => (
        <Text key={index}>
          <Text color={active ? palette.accent : undefined} dimColor={!active}>
            {index === 0 ? '› ' : '  '}
          </Text>
          {empty ? (
            <>
              {active ? <Text inverse>{placeholder.slice(0, 1)}</Text> : null}
              <Text dimColor>{active ? placeholder.slice(1) : placeholder}</Text>
            </>
          ) : line.cursor === null || !active ? (
            <Text>{line.text}</Text>
          ) : (
            <>
              <Text>{line.text.slice(0, line.cursor)}</Text>
              <Text inverse>{line.text.slice(line.cursor, line.cursor + 1) || ' '}</Text>
              <Text>{line.text.slice(line.cursor + 1)}</Text>
            </>
          )}
        </Text>
      ))}
    </Box>
  );
}

/** The draft split into display lines, with the cursor placed on its line. */
function composerRows(draft: TextState, width: number): { text: string; cursor: number | null }[] {
  const size = Math.max(4, width);
  const rows: { text: string; cursor: number | null }[] = [];
  let offset = 0;
  for (const paragraph of draft.value.split('\n')) {
    const chunks = paragraph.length === 0 ? [''] : (paragraph.match(new RegExp(`.{1,${size}}`, 'gs')) ?? ['']);
    for (const [index, chunk] of chunks.entries()) {
      const last = index === chunks.length - 1;
      const inside = draft.cursor >= offset && (draft.cursor < offset + chunk.length || (last && draft.cursor === offset + chunk.length));
      rows.push({ text: chunk, cursor: inside ? draft.cursor - offset : null });
      offset += chunk.length;
    }
    offset += 1; // the newline
  }
  return rows;
}

function messageRows(messages: readonly MessageView[], width: number): Row[] {
  const now = new Date();
  const authorWidth = Math.min(16, Math.max(6, ...messages.map((message) => (message.author?.username.length ?? 7) + 2)));
  const stampWidth = 7;
  const textWidth = Math.max(10, width - 1 - stampWidth - authorWidth);
  return messages.flatMap((message, index): Row[] => {
    const stamp = formatStamp(message.createdAt, now).padEnd(stampWidth);
    const author = (message.author ? `@${message.author.username}` : 'someone').slice(0, authorWidth - 1).padEnd(authorWidth);
    const rows: Row[] = [];
    if (message.replyTo) {
      const who = message.replyTo.author ? `@${message.replyTo.author.username}: ` : '';
      const quoted = message.replyTo.deleted ? 'deleted message' : oneLine(message.replyTo.body);
      rows.push({ key: `${message.id}:q`, index, kind: 'quote', stamp, author: '', text: `${symbols.reply} ${who}${quoted}` });
    }
    const lines = message.deletedAt ? ['message deleted'] : wrapText(message.body, textWidth);
    for (const [line, text] of lines.entries()) {
      rows.push({
        key: `${message.id}:${line}`,
        index,
        kind: line === 0 ? 'first' : 'more',
        stamp: line === 0 ? stamp : ' '.repeat(stampWidth),
        author: line === 0 ? author : ' '.repeat(authorWidth),
        text,
      });
    }
    return rows;
  });
}

function insert(draft: TextState, text: string): TextState {
  return { value: draft.value.slice(0, draft.cursor) + text + draft.value.slice(draft.cursor), cursor: draft.cursor + text.length };
}

function oneLine(text: string): string {
  const [first = ''] = text.split('\n');
  return first.length > 60 ? `${first.slice(0, 59)}${symbols.ellipsis}` : first;
}
