import type { MessageView } from '../../application/chat.js';
import type { AppServices } from '../../application/services/index.js';
import type { ChatOperations } from '../../application/ports.js';
import { ValidationError } from '../../domain/errors.js';
import { symbols } from '../../ui/theme/theme.js';
import { formatStamp } from '../../utils/time.js';
import { bold, color, dim, print, success } from '../output.js';
import { withSession } from '../runtime.js';
import { parseCommand, requireArg } from './args.js';
import { runInterface } from './tui.js';

/** `soja chat …` (remote mode): the chat from scripts and hooks, or the interface on a channel. */
export async function chatCommand(args: string[]): Promise<void> {
  const [sub, ...rest] = args;
  switch (sub) {
    case 'send':
      return send(rest);
    case 'log':
      return log(rest);
    case 'channels':
    case 'ls':
      return channels();
    case 'new':
    case 'create':
      return create(rest);
    case 'topic':
      return topic(rest);
    case 'archive':
    case 'unarchive':
      return archive(sub === 'archive', rest);
    case undefined:
      return runInterface({ route: { name: 'chat' } });
    default:
      if (sub.startsWith('#') || !sub.startsWith('-')) return runInterface({ route: { name: 'chat', channel: sub } });
      throw new ValidationError(`Unknown chat command “${sub}”.`, { hint: 'Try: send, log, channels, new, topic, archive, unarchive, or `soja chat #channel`.' });
  }
}

function chatOf(services: AppServices): ChatOperations {
  if (!services.chat) {
    throw new ValidationError('The chat needs a team: SOJA is in local mode.', { hint: '`soja login --server <url>` to work with a SOJA server.' });
  }
  return services.chat;
}

async function send(args: string[]): Promise<void> {
  const { positionals } = parseCommand(args, {});
  const usage = 'soja chat send #channel "message"  (use - to read the message from stdin)';
  const channel = requireArg(positionals[0], 'channel', usage);
  let text = positionals.slice(1).join(' ');
  if (text === '-') text = await readStdin();
  requireArg(text.trim() || undefined, 'message', usage);
  await withSession(async (services, session) => {
    const message = await chatOf(services).send(session, channel, text);
    const target = await chatOf(services).channel(session, message.channelId);
    success(`Sent to ${bold(`#${target.name}`)}`);
  });
}

async function log(args: string[]): Promise<void> {
  const { values, positionals } = parseCommand(args, { n: { type: 'string', short: 'n' } });
  const count = values.n === undefined ? 20 : Number(values.n);
  if (!Number.isInteger(count) || count < 1) throw new ValidationError('-n takes a positive number.');
  await withSession(async (services, session) => {
    const chat = chatOf(services);
    const channel = await chat.channel(session, positionals[0] ?? 'general');
    const messages = await chat.messages(session, channel.id, count);
    print(`${bold(`#${channel.name}`)}${channel.topic ? dim(`  ${channel.topic}`) : ''}`);
    if (messages.length === 0) print(dim('  No messages yet.'));
    const now = new Date();
    for (const message of messages) printMessage(message, now);
  });
}

function printMessage(message: MessageView, now: Date): void {
  const who = message.author ? `@${message.author.username}` : 'someone';
  const stamp = dim(formatStamp(message.createdAt, now).padEnd(7));
  if (message.replyTo) {
    const quoted = message.replyTo.deleted ? 'deleted message' : (message.replyTo.body.split('\n')[0] ?? '');
    print(`${' '.repeat(8)}${dim(`${symbols.reply} ${message.replyTo.author ? `@${message.replyTo.author.username}: ` : ''}${quoted.slice(0, 60)}`)}`);
  }
  const [first = '', ...more] = message.deletedAt ? ['message deleted'] : message.body.split('\n');
  const body = message.deletedAt ? dim(first) : message.mentionsMe ? color('yellow', first) : first;
  const flags = `${message.pending ? dim(` ${symbols.pending}`) : ''}${message.editedAt && !message.deletedAt ? dim(' (edited)') : ''}`;
  print(`${stamp} ${bold(who)} ${body}${flags}`);
  for (const line of more) print(`${' '.repeat(8)}${line}`);
}

async function channels(): Promise<void> {
  await withSession(async (services, session) => {
    const list = await chatOf(services).channels(session);
    for (const channel of list) {
      const badges = [
        channel.unread ? color('green', `${channel.unread} unread`) : '',
        channel.mentions ? color('yellow', `@${channel.mentions}`) : '',
        channel.archivedAt ? dim('archived') : '',
      ].filter(Boolean);
      print(`  ${`#${channel.name}`.padEnd(24)}${badges.join('  ')}${channel.topic ? `  ${dim(channel.topic)}` : ''}`);
    }
  });
}

async function create(args: string[]): Promise<void> {
  const { values, positionals } = parseCommand(args, { topic: { type: 'string' } });
  const name = requireArg(positionals[0], 'channel name', 'soja chat new <name> [--topic "…"]');
  await withSession(async (services, session) => {
    const channel = await chatOf(services).createChannel(session, name, values.topic ?? null);
    success(`Created ${bold(`#${channel.name}`)}`);
  });
}

async function topic(args: string[]): Promise<void> {
  const { positionals } = parseCommand(args, {});
  const channel = requireArg(positionals[0], 'channel', 'soja chat topic <channel> "text"  (empty text clears it)');
  const text = positionals.slice(1).join(' ').trim();
  await withSession(async (services, session) => {
    const chat = chatOf(services);
    const target = await chat.channel(session, channel);
    const updated = await chat.updateChannel(session, target.id, { topic: text || null });
    success(`${bold(`#${updated.name}`)} ${updated.topic ? dim(updated.topic) : dim('no topic')}`);
  });
}

async function archive(archived: boolean, args: string[]): Promise<void> {
  const { positionals } = parseCommand(args, {});
  const channel = requireArg(positionals[0], 'channel', `soja chat ${archived ? 'archive' : 'unarchive'} <channel>`);
  await withSession(async (services, session) => {
    const chat = chatOf(services);
    const target = await chat.channel(session, channel);
    const updated = await chat.updateChannel(session, target.id, { archived });
    success(`${bold(`#${updated.name}`)} ${archived ? 'archived: it keeps its history and takes no new messages' : 'restored'}`);
  });
}

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8');
}
