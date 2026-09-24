import { ValidationError } from '../../domain/errors.js';
import { symbols } from '../../ui/theme/theme.js';
import { bold, color, dim, print, success } from '../output.js';
import { withSession } from '../runtime.js';
import { parseCommand, requireArg } from './args.js';

export async function workspaceCommand(args: string[]): Promise<void> {
  const [sub, ...rest] = args;
  if (sub === undefined || sub === 'list' || sub === 'ls') return list();
  if (sub === 'use' || sub === 'switch') return switchWorkspace(rest);
  throw new ValidationError(`Unknown workspace command “${sub}”.`, { hint: 'Try: list, use <workspace>.' });
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
