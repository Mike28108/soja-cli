import { randomUUID } from 'node:crypto';
import type { ChannelSummary, ChatOperations, ChatTotals, MessageView } from '../../application/chat.js';
import type { TaskOperations } from '../../application/ports.js';
import type { Session, TaskView } from '../../application/types.js';
import { CHANNEL_NAME, MAX_MESSAGE_LENGTH, mentions, normalizeChannelName, taskRefsIn, type Channel, type ChatMessage } from '../../domain/chat.js';
import type { UserRef } from '../../domain/entities.js';
import { NotFoundError, SojaError, ValidationError } from '../../domain/errors.js';
import { formatTaskRef } from '../../domain/task.js';
import { terminalSafe } from '../../utils/text.js';
import { OfflineError } from '../remote/api-client.js';
import type { ReplicaContext } from './services.js';
import type { ChatOpType } from './store.js';

const TITLE_MAX = 120;

/**
 * Chat in remote mode: messages live in the replica, so the chat opens and
 * reads offline; sends, edits, deletes and read marks are queued operations
 * the next sync delivers (right away when online).
 */
export class ReplicaChatService implements ChatOperations {
  constructor(
    private readonly context: ReplicaContext,
    private readonly tasks: TaskOperations,
  ) {}

  async channels(session: Session): Promise<ChannelSummary[]> {
    const [channels, reads] = await Promise.all([this.context.store.channels(session.workspace.id), this.context.store.reads()]);
    const summaries = await Promise.all(channels.map((channel) => this.summarize(session, channel, reads.get(channel.id) ?? 0)));
    // #general first, archived last, the rest by name.
    return summaries.sort(
      (a, b) =>
        Number(a.archivedAt !== null) - Number(b.archivedAt !== null) ||
        Number(b.name === 'general') - Number(a.name === 'general') ||
        a.name.localeCompare(b.name),
    );
  }

  async totals(session: Session): Promise<ChatTotals> {
    const channels = await this.channels(session);
    return channels.reduce((sum, channel) => ({ unread: sum.unread + channel.unread, mentions: sum.mentions + channel.mentions }), { unread: 0, mentions: 0 });
  }

  async channel(session: Session, target: string): Promise<ChannelSummary> {
    const name = normalizeChannelName(target);
    const channel = (await this.channels(session)).find((candidate) => candidate.id === target || candidate.name === name);
    if (!channel) {
      throw new NotFoundError(`There is no #${name} channel.`, { hint: 'List them with `soja chat channels`; a sync may bring new ones.' });
    }
    return channel;
  }

  async messages(session: Session, channelId: string, limit = 200): Promise<MessageView[]> {
    const rows = ordered(await this.context.store.messagesIn(channelId));
    return this.views(session, rows.slice(-limit), rows);
  }

  async send(session: Session, channel: string, body: string, options: { replyToId?: string | null } = {}): Promise<MessageView> {
    const target = await this.channel(session, channel);
    if (target.archivedAt) throw new ValidationError(`#${target.name} is archived.`, { hint: 'Write in another channel.' });
    const text = cleanBody(body);
    const replyToId = options.replyToId ?? null;
    if (replyToId) {
      const original = await this.context.store.findMessage(replyToId);
      if (!original || original.channelId !== target.id) throw new ValidationError('You can only reply to a message in the same channel.');
    }
    const message: ChatMessage = {
      id: randomUUID(),
      seq: null,
      workspaceId: session.workspace.id,
      channelId: target.id,
      authorId: session.user.id,
      body: text,
      replyToId,
      createdAt: new Date(),
      editedAt: null,
      deletedAt: null,
    };
    await this.context.store.upsertMessage(message);
    await this.enqueue(session, 'message.send', { messageId: message.id, channelId: target.id, body: text, ...(replyToId ? { replyToId } : {}) });
    const [view] = await this.views(session, [message], [message]);
    if (!view) throw new SojaError('The message could not be prepared.');
    return view;
  }

  async edit(session: Session, messageId: string, body: string): Promise<void> {
    const message = await this.own(session, messageId, 'edit');
    const text = cleanBody(body);
    if (text === message.body) return;
    await this.context.store.patchMessage(messageId, { body: text, editedAt: new Date() });
    await this.enqueue(session, 'message.edit', { messageId, body: text });
  }

  async remove(session: Session, messageId: string): Promise<void> {
    await this.own(session, messageId, 'delete');
    await this.context.store.patchMessage(messageId, { body: '', deletedAt: new Date() });
    await this.enqueue(session, 'message.delete', { messageId });
  }

  async markRead(session: Session, channelId: string): Promise<void> {
    const seqs = (await this.context.store.messagesIn(channelId)).map((message) => message.seq ?? 0);
    const latest = Math.max(0, ...seqs);
    const current = (await this.context.store.reads()).get(channelId) ?? 0;
    if (latest <= current) return;
    await this.context.store.markRead(channelId, latest);
    // Only the newest mark matters: replace one still waiting in the queue.
    for (const op of await this.context.store.pending(session.workspace.id)) {
      if (op.type === 'channel.read' && op.payload['channelId'] === channelId && op.attempts === 0) await this.context.store.dropQueued(op.opId);
    }
    await this.enqueue(session, 'channel.read', { channelId, lastReadSeq: latest });
  }

  async createChannel(session: Session, name: string, topic: string | null = null): Promise<ChannelSummary> {
    const clean = normalizeChannelName(name);
    if (!CHANNEL_NAME.test(clean)) throw new ValidationError('Channel names use lowercase letters, numbers and dashes (max 40).');
    const channel = await this.online('Creating a channel', () =>
      this.context.api.post<Channel>(`/v1/workspaces/${session.workspace.id}/channels`, { name: clean, ...(topic ? { topic: terminalSafe(topic) } : {}) }),
    );
    await this.context.store.upsertChannel(channel);
    return this.summarize(session, channel, 0);
  }

  async loadOlder(session: Session, channelId: string): Promise<number> {
    const known = (await this.context.store.messagesIn(channelId)).flatMap((message) => (message.seq === null ? [] : [message.seq]));
    const before = known.length ? Math.min(...known) : null;
    const older = await this.online('Loading older messages', () =>
      this.context.api.get<ChatMessage[]>(
        `/v1/workspaces/${session.workspace.id}/channels/${channelId}/messages?limit=100${before === null ? '' : `&before=${before}`}`,
      ),
    );
    for (const message of older) await this.context.store.upsertMessage(message);
    return older.length;
  }

  async mentionsOfTask(session: Session, taskNumber: number, limit = 5): Promise<MessageView[]> {
    const ref = formatTaskRef(taskNumber);
    const rows = (await this.context.store.messagesContaining(session.workspace.id, ref)).filter(
      (message) => message.deletedAt === null && taskRefsIn(message.body).includes(taskNumber),
    );
    return this.views(session, ordered(rows).reverse().slice(0, limit), rows);
  }

  async taskFromMessage(session: Session, messageId: string): Promise<TaskView> {
    const message = await this.context.store.findMessage(messageId);
    if (!message || message.deletedAt) throw new NotFoundError('That message no longer exists.');
    const channel = await this.context.store.findChannel(message.channelId);
    const [author] = message.authorId ? await this.context.repos.users.findByIds([message.authorId]) : [];
    const firstLine = message.body.split('\n').find((line) => line.trim()) ?? message.body;
    const title = firstLine.trim().length > TITLE_MAX ? `${firstLine.trim().slice(0, TITLE_MAX - 1)}…` : firstLine.trim();
    const quote = message.body
      .split('\n')
      .map((line) => `> ${line}`)
      .join('\n');
    const task = await this.tasks.create(session, {
      title,
      description: `${author ? `@${author.username}` : 'Someone'} in #${channel?.name ?? 'chat'}:\n${quote}`,
      ...(author ? { requester: `@${author.username}` } : {}),
    });
    // Queued after the task, so the reply reaches the server with its real number.
    if (channel && !channel.archivedAt) await this.send(session, channel.id, `${symbolArrow} ${task.ref} ${task.title}`, { replyToId: message.id });
    return task;
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private async summarize(session: Session, channel: Channel, lastReadSeq: number): Promise<ChannelSummary> {
    const unread = (await this.context.store.messagesIn(channel.id)).filter(
      (message) => message.seq !== null && message.seq > lastReadSeq && message.authorId !== session.user.id && message.deletedAt === null,
    );
    return {
      ...channel,
      lastReadSeq,
      unread: unread.length,
      mentions: unread.filter((message) => mentions(message.body, session.user.username)).length,
    };
  }

  /** Adds authors, the quoted message, and flags. `pool` holds messages a reply may quote. */
  private async views(session: Session, rows: readonly ChatMessage[], pool: readonly ChatMessage[]): Promise<MessageView[]> {
    const pending = new Set<string>();
    for (const op of await this.context.store.pending(session.workspace.id)) {
      if (op.type === 'message.send' || op.type === 'message.edit' || op.type === 'message.delete') pending.add(String(op.payload['messageId']));
    }
    const byId = new Map(pool.map((message) => [message.id, message]));
    for (const row of rows) {
      if (row.replyToId && !byId.has(row.replyToId)) {
        const quoted = await this.context.store.findMessage(row.replyToId);
        if (quoted) byId.set(quoted.id, quoted);
      }
    }
    const authorIds = new Set<string>();
    for (const message of [...rows, ...byId.values()]) if (message.authorId) authorIds.add(message.authorId);
    const users = new Map<string, UserRef>(
      (await this.context.repos.users.findByIds([...authorIds])).map((user) => [user.id, { id: user.id, username: user.username, displayName: user.displayName }]),
    );
    return rows.map((message) => {
      const quoted = message.replyToId ? byId.get(message.replyToId) : undefined;
      return {
        ...message,
        author: message.authorId ? (users.get(message.authorId) ?? null) : null,
        pending: pending.has(message.id),
        mine: message.authorId === session.user.id,
        mentionsMe: message.authorId !== session.user.id && mentions(message.body, session.user.username),
        replyTo: quoted
          ? { id: quoted.id, author: quoted.authorId ? (users.get(quoted.authorId) ?? null) : null, body: quoted.body, deleted: quoted.deletedAt !== null }
          : null,
      };
    });
  }

  private async own(session: Session, messageId: string, action: 'edit' | 'delete'): Promise<ChatMessage> {
    const message = await this.context.store.findMessage(messageId);
    if (!message || message.deletedAt) throw new NotFoundError('That message no longer exists.');
    if (message.authorId !== session.user.id) throw new ValidationError(`You can only ${action} your own messages.`);
    return message;
  }

  private async enqueue(session: Session, type: ChatOpType, payload: Record<string, unknown>): Promise<void> {
    await this.context.store.enqueue(
      { opId: randomUUID(), workspaceId: session.workspace.id, type, taskId: null, payload, base: null, occurredAt: new Date() },
      [],
    );
    this.context.onWrite();
  }

  private async online<T>(what: string, work: () => Promise<T>): Promise<T> {
    try {
      return await work();
    } catch (error) {
      if (error instanceof OfflineError) {
        throw new SojaError(`${what} needs a connection to the SOJA server.`, { hint: 'Reading and sending messages work offline.', cause: error });
      }
      throw error;
    }
  }
}

const symbolArrow = '→';

/** Server order, with messages still waiting to be sent at the end in the order they were written. */
function ordered(rows: readonly ChatMessage[]): ChatMessage[] {
  return [...rows].sort((a, b) => {
    if (a.seq !== null && b.seq !== null) return a.seq - b.seq;
    if (a.seq !== null) return -1;
    if (b.seq !== null) return 1;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });
}

/** Terminal-safe, trimmed, and within the server's limit. */
function cleanBody(body: string): string {
  const text = terminalSafe(body).trim();
  if (!text) throw new ValidationError('The message is empty.');
  if (text.length > MAX_MESSAGE_LENGTH) throw new ValidationError(`Keep messages under ${MAX_MESSAGE_LENGTH} characters.`);
  return text;
}
