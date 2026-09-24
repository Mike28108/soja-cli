import { SojaError, ValidationError } from '../../domain/errors.js';
import { symbols } from '../../ui/theme/theme.js';
import { bold, color, dim, print, success } from '../output.js';
import { withServices, withSession } from '../runtime.js';
import { parseCommand, requireArg } from './args.js';

export async function workspaceCommand(args: string[]): Promise<void> {
  const [sub, ...rest] = args;
  if (sub === undefined || sub === 'list' || sub === 'ls') return list();
  if (sub === 'use' || sub === 'switch') return switchWorkspace(rest);
  if (sub === 'create' || sub === 'new') return create(rest);
  if (sub === 'add' || sub === 'add-member') return addMember(rest);
  throw new ValidationError(`Unknown workspace command “${sub}”.`, { hint: 'Try: list, create <name>, add <username>, use <workspace>.' });
}

async function list(): Promise<void> {
  await withSession(async (services, session) => {
    for (const workspace of await services.workspaces.list(session.user)) {
      const current = workspace.id === session.workspace.id;
      print(`${current ? color('green', symbols.active) : ' '} ${current ? bold(workspace.name) : workspace.name}  ${dim(`${workspace.slug} ${symbols.dot} ${workspace.role}`)}`);
    }
  });
}

export async function switchWorkspace(args: string[]): Promise<void> {
  const { positionals } = parseCommand(args, {});
  const target = requireArg(positionals.join(' ').trim(), 'workspace', 'soja use bravos-development');
  await withSession(async (services, session) => {
    const next = await services.workspaces.switchTo(session.user, target);
    success(`Now in ${bold(next.workspace.name)}`);
  });
}

async function create(args: string[]): Promise<void> {
  const { positionals } = parseCommand(args, {});
  const name = requireArg(positionals.join(' ').trim(), 'workspace name', 'soja workspace create "Bravos Development"');
  await withServices(async (services) => {
    // Not `current()`: in remote mode you may have no workspace yet, but you are signed in.
    const user = await services.session.user();
    if (!user) throw new SojaError('SOJA is not set up yet.', { hint: 'Run `soja` once, or `soja login --server <url>`.' });
    const workspace = await services.workspaces.create(user, { name });
    await services.workspaces.switchTo(user, workspace.id);
    success(`Created ${bold(workspace.name)} ${dim(workspace.slug)} ${dim('· now active')}`);
  });
}

/** Adds a developer to the active workspace (in remote mode: someone who already ran `soja login`). */
async function addMember(args: string[]): Promise<void> {
  const { values, positionals } = parseCommand(args, { name: { type: 'string', short: 'n' } });
  const username = requireArg(positionals[0], 'username', 'soja workspace add angel [--name "Angel"]');
  await withSession(async (services, session) => {
    const member = await services.workspaces.addMember(session, { username, ...(values.name ? { displayName: values.name } : {}) });
    success(`@${member.username} joined ${bold(session.workspace.name)}`);
  });
}
