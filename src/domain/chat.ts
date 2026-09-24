import { TASK_REF_PREFIX } from './task.js';

/** A workspace chat channel (remote mode only; docs/CHAT.md in soja-backend). */
export interface Channel {
  id: string;
  workspaceId: string;
  name: string;
  topic: string | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
  archivedAt: Date | null;
}

export interface ChatMessage {
  /** Chosen by the client that wrote it, so a resend is stored once. */
  id: string;
  /** Server order; null while the message waits to be sent. */
  seq: number | null;
  workspaceId: string;
  channelId: string;
  authorId: string | null;
  body: string;
  replyToId: string | null;
  createdAt: Date;
  editedAt: Date | null;
  deletedAt: Date | null;
}

export const MAX_MESSAGE_LENGTH = 4000;
export const CHANNEL_NAME = /^[a-z0-9][a-z0-9-]{0,39}$/;

/** `#General ` → `general`. */
export function normalizeChannelName(name: string): string {
  return name.trim().toLowerCase().replace(/^#/, '');
}

// Same rules as the server, which resolves them to real members and tasks.
const MENTION = /(^|[^\w@])@([a-z0-9][a-z0-9._-]{0,38})/gi;
const TASK_REF = new RegExp(`\\b${TASK_REF_PREFIX}-(\\d{1,9})\\b`, 'gi');

/** Usernames written as `@name`, lowercased and unique. */
export function mentionsIn(body: string): string[] {
  return [...new Set([...body.matchAll(MENTION)].map((match) => (match[2] ?? '').toLowerCase()))];
}

/** Task numbers written as `SOJA-12`. */
export function taskRefsIn(body: string): number[] {
  return [...new Set([...body.matchAll(TASK_REF)].map((match) => Number(match[1])))];
}

export function mentions(body: string, username: string): boolean {
  return mentionsIn(body).includes(username.toLowerCase());
}
