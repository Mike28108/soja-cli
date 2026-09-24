import { ValidationError } from '../../domain/errors.js';
import { symbols } from '../../ui/theme/theme.js';
import { bold, color, dim, print, success } from '../output.js';
import { withSession } from '../runtime.js';
import { parseCommand, requireArg } from './args.js';

export async function projectCommand(args: string[]): Promise<void> {
  const [sub, ...rest] = args;
  if (sub === undefined || sub === 'list' || sub === 'ls') return list();
  if (sub === 'create' || sub === 'new' || sub === 'add') return create(rest);
  throw new ValidationError(`Unknown project command “${sub}”.`, { hint: 'Try: list, create.' });
}

async function list(): Promise<void> {
  await withSession(async (services, session) => {
    const projects = await services.projects.list(session);
    print(`${bold('PROJECTS')}  ${dim(session.workspace.name)}`);
    print();
    if (projects.length === 0) {
      print(dim('  No projects yet. Add one with `soja project create <name>`.'));
      return;
    }
    const width = Math.max(...projects.map((project) => project.name.length)) + 3;
    for (const project of projects) {
      const extra = [
        project.counts.in_progress ? color('yellow', `${project.counts.in_progress} in progress`) : '',
        project.counts.review ? color('cyan', `${project.counts.review} review`) : '',
        project.counts.blocked ? color('red', `${project.counts.blocked} blocked`) : '',
      ].filter(Boolean);
      print(
        `  ${dim(project.key.padEnd(8))}${project.name.padEnd(width)}${`${project.active} active`.padEnd(11)}${extra.join(dim(` ${symbols.dot} `))}`,
      );
    }
  });
}

async function create(args: string[]): Promise<void> {
  const { values, positionals } = parseCommand(args, {
    key: { type: 'string', short: 'k' },
    description: { type: 'string', short: 'd' },
    'repo-path': { type: 'string' },
    'repo-url': { type: 'string' },
  });
  const name = requireArg(positionals.join(' ').trim(), 'project name', 'soja project create EnrollBridge --key ENROLL');
  await withSession(async (services, session) => {
    const project = await services.projects.create(session, {
      name,
      ...(values.key ? { key: values.key } : {}),
      description: values.description ?? null,
      repositoryPath: values['repo-path'] ?? null,
      repositoryUrl: values['repo-url'] ?? null,
    });
    success(`Created project ${bold(project.name)} ${dim(project.key)}`);
  });
}
