import type { Channel, ChatMessage } from '../domain/chat.js';
import type { UserRef } from '../domain/entities.js';
import type { Session, TaskView } from './types.js';

/** A channel with what you have not read yet. */
export interface ChannelSummary extends Channel {
  unread: number;
  /** Unread messages that mention you. */
  mentions: number;
  lastReadSeq: number;
}

export interface MessageView extends ChatMessage {
  author: UserRef | null;
  /** Written here and not yet acknowledged by the server. */
  pending: boolean;
  mine: boolean;
  mentionsMe: boolean;
  replyTo: { id: string; author: UserRef | null; body: string; deleted: boolean } | null;
}

export interface ChatTotals {
  unread: number;
  mentions: number;
}

/**
 * Team chat (remote mode only; docs/CHAT.md in soja-backend). Reads come
 * from the replica and work offline; messages are queued like task changes.
 */
export interface ChatOperations {
  channels(session: Session): Promise<ChannelSummary[]>;
  totals(session: Session): Promise<ChatTotals>;
  /** By id, `name` or `#name`. */
  channel(session: Session, target: string): Promise<ChannelSummary>;
  /** The latest `limit` messages, oldest first. */
  messages(session: Session, channelId: string, limit?: number): Promise<MessageView[]>;
  send(session: Session, channel: string, body: string, options?: { replyToId?: string | null }): Promise<MessageView>;
  edit(session: Session, messageId: string, body: string): Promise<void>;
  remove(session: Session, messageId: string): Promise<void>;
  /** Marks everything in the channel as read (on every machine, after sync). */
  markRead(session: Session, channelId: string): Promise<void>;
  /** Needs the server. */
  createChannel(session: Session, name: string, topic?: string | null): Promise<ChannelSummary>;
  /** Fetches messages older than the replica has; resolves to how many arrived. Needs the server. */
  loadOlder(session: Session, channelId: string): Promise<number>;
  /** Messages that name the task (`SOJA-12`), newest first. */
  mentionsOfTask(session: Session, taskNumber: number, limit?: number): Promise<MessageView[]>;
  /** Creates a task quoting the message and replies in the channel with its reference. */
  taskFromMessage(session: Session, messageId: string): Promise<TaskView>;
}
