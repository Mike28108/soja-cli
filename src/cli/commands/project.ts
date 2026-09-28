import { existsSync } from 'node:fs';
import { ValidationError } from '../../domain/errors.js';
import { symbols } from '../../ui/theme/theme.js';
import { bold, color, dim, print, success } from '../output.js';
import { withSession } from '../runtime.js';
import { parseCommand, requireArg } from './args.js';
import { tildify } from '../../utils/text.js';

export async function projectCommand(args: string[]): Promise<void> {
  const [sub, ...rest] = args;
  if (sub === undefined || sub === 'list' || sub === 'ls') return list();
  if (sub === 'create' || sub === 'new' || sub === 'add') return create(rest);
  if (sub === 'link') return link(rest);
  if (sub === 'unlink') return unlink(rest);
  if (sub === 'edit') return edit(rest);
  if (sub === 'repo') return repository(rest);
  throw new ValidationError(`Unknown project command “${sub}”.`, { hint: 'Try: list, create, edit, link, unlink, repo.' });
}

async function repository(args: string[]): Promise<void> {
  const [action, key, name, ...pathParts] = args;
  const projectKey = requireArg(key, 'project', 'soja project repo list PROJECT');
  await withSession(async (services, session) => {
    const project = await services.projects.resolve(session, projectKey);
    if (!action || action === 'list' || action === 'ls') {
      const current = (await services.projects.list(session)).find((item) => item.id === project.id);
      print(`${bold('REPOSITORIES')}  ${dim(project.key)}`);
      for (const repository of current?.repositories ?? []) print(`  ${bold(repository.name)}  ${dim(repository.localPath ? tildify(repository.localPath) : 'not linked here')}${repository.repositoryUrl ? dim(`  ${repository.repositoryUrl}`) : ''}`);
      if (!current?.repositories.length) print(dim('  No repositories. Add one with `soja project repo add KEY NAME PATH`.'));
      return;
    }
    if (action === 'add') {
      const repoName = requireArg(name, 'repository name', 'soja project repo add ENROLL backend ../backend');
      const path = requireArg(pathParts.join(' '), 'repository path', 'soja project repo add ENROLL backend ../backend');
      const repo = await services.projects.addRepository(session, project, { name: repoName, path });
      success(`Added ${bold(repo.name)} to ${project.key} · ${tildify(repo.localPath ?? path)}`);
      return;
    }
    if (action === 'link') {
      const repositoryName = requireArg(name, 'repository name', 'soja project repo link ENROLL backend ../backend');
      const path = requireArg(pathParts.join(' '), 'repository path', 'soja project repo link ENROLL backend ../backend');
      const repository = (await services.projects.list(session)).find((item) => item.id === project.id)?.repositories.find((item) => item.name === repositoryName);
      if (!repository) throw new ValidationError(`Repository “${repositoryName}” was not found in ${project.key}.`);
      const linked = await services.projects.linkProjectRepository(session, project, repository.id, path);
      success(`Linked ${bold(repositoryName)} to ${tildify(linked.localPath ?? path)}`);
      return;
    }
    if (action === 'remove') {
      const repo = (await services.projects.list(session)).find((item) => item.id === project.id)?.repositories.find((item) => item.name === name);
      if (!repo) throw new ValidationError(`Repository “${name ?? ''}” was not found in ${project.key}.`);
      await services.projects.removeRepository(session, project, repo.id);
      success(`Removed ${bold(repo.name)} from ${project.key}`);
      return;
    }
    throw new ValidationError(`Unknown repository action “${action}”.`, { hint: 'Try: repo list, repo add, repo remove.' });
  });
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
      if (project.repositoryPath) print(dim(`  ${' '.repeat(8)}${tildify(project.repositoryPath)}`));
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

async function link(args: string[]): Promise<void> {
  const { positionals } = parseCommand(args, {});
  const key = requireArg(positionals[0], 'project', 'soja project link ENROLL [path]');
  const target = positionals[1];
  await withSession(async (services, session) => {
    const project = await services.projects.resolve(session, key);
    // A bare name that is not a folder here means a subfolder of the parent folders.
    const path =
      target === undefined
        ? process.cwd()
        : !target.includes('/') && !existsSync(target)
          ? services.folders.findChild(target).path
          : target;
    const linked = await services.projects.linkRepository(session, project, path);
    success(`Linked ${bold(linked.name)} to ${tildify(linked.repositoryPath ?? path)}`);
    if (linked.repositoryUrl) print(dim(`  ${linked.repositoryUrl}`));
  });
}

async function unlink(args: string[]): Promise<void> {
  const { positionals } = parseCommand(args, {});
  const key = requireArg(positionals[0], 'project', 'soja project unlink ENROLL');
  await withSession(async (services, session) => {
    const project = await services.projects.unlinkRepository(session, await services.projects.resolve(session, key));
    success(`${bold(project.name)} is no longer linked to a repository`);
  });
}

/** `soja project edit <key> [--name] [--description] [--url]`: an empty value clears description or URL. */
async function edit(args: string[]): Promise<void> {
  const { values, positionals } = parseCommand(args, {
    name: { type: 'string' },
    description: { type: 'string', short: 'd' },
    url: { type: 'string' },
  });
  const key = requireArg(positionals[0], 'project', 'soja project edit ENROLL --name "…" --description "…" --url "…"');
  if (values.name === undefined && values.description === undefined && values.url === undefined) {
    throw new ValidationError('Nothing to change.', { hint: 'Pass --name, --description or --url.' });
  }
  await withSession(async (services, session) => {
    const project = await services.projects.update(session, await services.projects.resolve(session, key), {
      ...(values.name !== undefined ? { name: values.name } : {}),
      ...(values.description !== undefined ? { description: values.description } : {}),
      ...(values.url !== undefined ? { repositoryUrl: values.url } : {}),
    });
    success(`${bold(project.key)} ${project.name}${project.description ? dim(`  ${project.description}`) : ''}`);
  });
}
