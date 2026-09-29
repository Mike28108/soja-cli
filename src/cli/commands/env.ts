import { hostname } from 'node:os';
import { ENV_ENVIRONMENTS, GRANT_DAYS, type EnvEnvironment, type EnvOperations, type GrantDays } from '../../application/env.js';
import type { AppServices } from '../../application/services/index.js';
import type { Session } from '../../application/types.js';
import { SojaError, ValidationError } from '../../domain/errors.js';
import { withSession } from '../runtime.js';
import { bold, dim, print, success } from '../output.js';
import { oneOf, parseCommand, requireArg } from './args.js';

const USAGE = 'soja env <setup|devices|trust|ls|create|set|rm|grant|revoke|share|rotate|history> …';

/** `soja env …`: shared, end-to-end encrypted environment variables (remote mode). */
export async function envCommand(args: string[]): Promise<void> {
  const [action, ...rest] = args;
  await withSession(async (services, session) => {
    const env = services.env;
    if (!env) throw new SojaError('Shared environment variables need remote mode.', { hint: 'Run `soja login`.' });
    switch (action) {
      case 'setup':
        return setup(env, rest);
      case 'devices':
        return devices(env, session, rest);
      case 'trust':
        return trust(env, session, rest);
      case 'ls':
      case 'list':
        return list(services, env, session, rest);
      case 'create':
        return create(services, env, session, rest);
      case 'set':
        return set(services, env, session, rest);
      case 'rm':
      case 'remove':
        return remove(services, env, session, rest);
      case 'grant':
        return grant(services, env, session, rest);
      case 'revoke':
        return revoke(services, env, session, rest);
      case 'share':
        return share(services, env, session, rest);
      case 'rotate':
        return rotate(services, env, session, rest);
      case 'history':
        return history(services, env, session, rest);
      default:
        throw new ValidationError(action ? `Unknown env action “${action}”.` : 'Say what to do.', { hint: `Usage: ${USAGE}` });
    }
  });
}

/** `-p` project, `-r` one of its repositories (without it: the whole project), `-e` environment. */
const target = { project: { type: 'string', short: 'p' }, repo: { type: 'string', short: 'r' }, env: { type: 'string', short: 'e' } } as const;

async function setup(env: EnvOperations, args: string[]) {
  const { values } = parseCommand(args, { label: { type: 'string' } });
  const device = await env.setup(values.label ?? hostname());
  success(`This machine is ${bold(device.label)}.`);
  print(`  Fingerprint ${bold(device.fingerprint)}`);
  print(dim('  Others may ask you to read it to them before trusting this device.'));
}

async function devices(env: EnvOperations, session: Session, args: string[]) {
  const [sub, id] = args;
  if (sub === 'remove') {
    await env.removeDevice(requireArg(id, 'device id', 'soja env devices remove <id>'));
    return success('Device removed. Vaults it could open are marked for rotation.');
  }
  const TRUST = { this: 'this machine', pinned: 'trusted (first use)', confirmed: 'confirmed', new: 'not seen yet', blocked: 'NEEDS CONFIRMING' } as const;
  for (const device of await env.devices(session)) {
    const line = `${bold(`@${device.username}`)} ${dim(device.role)} · ${device.label} · ${device.fingerprint} · ${TRUST[device.trust]}`;
    print(device.trust === 'blocked' ? `${line}\n  ${dim(`id ${device.id} · compare the fingerprint with its owner, then \`soja env trust ${device.id}\``)}` : line);
  }
}

async function trust(env: EnvOperations, session: Session, args: string[]) {
  const id = requireArg(args[0], 'device id', 'soja env trust <device id>');
  const device = await env.trust(session, id);
  success(`Trusting @${device.username}’s ${device.label} (${device.fingerprint}).`);
}

async function list(services: AppServices, env: EnvOperations, session: Session, args: string[]) {
  const { values } = parseCommand(args, target);
  if (values.env) {
    const { vault } = await resolveVault(services, env, session, values);
    for (const variable of await env.names(session, vault.id)) print(`${bold(variable.name)} ${dim(`updated ${variable.updatedAt.toLocaleString()}`)}`);
    return;
  }
  const project = values.project || values.repo ? await resolveProject(services, session, values.project) : null;
  const vaults = await env.vaults(session, project?.id);
  if (!vaults.length) return print(dim('No shared variables yet. An owner creates them with `soja env create -p <project> [-r <repository>] -e <environment>`.'));
  const projects = await services.projects.list(session);
  const names = new Map(projects.map((entry) => [entry.id, entry.name]));
  const repositories = new Map(projects.flatMap((entry) => entry.repositories.map((repository) => [repository.id, repository.name] as const)));
  for (const vault of vaults) {
    const access = !vault.canRead ? dim('no access') : vault.expiresAt ? `until ${vault.expiresAt.toLocaleString()}` : 'owner';
    const extra = [
      vault.rotationRequired ? 'rotation required' : null,
      vault.pendingDevices.length ? `${vault.pendingDevices.length} device(s) waiting` : null,
      vault.grants.length ? `shared with ${vault.grants.map((grant) => `@${grant.username}`).join(', ')}` : null,
    ].filter(Boolean);
    const scope = vault.repositoryId ? `/${repositories.get(vault.repositoryId) ?? '?'}` : dim(' (whole project)');
    print(`${bold(names.get(vault.projectId) ?? vault.projectId)}${scope} · ${vault.environment} · ${vault.variables} variable(s) · ${access}${extra.length ? dim(` · ${extra.join(' · ')}`) : ''}`);
  }
}

async function create(services: AppServices, env: EnvOperations, session: Session, args: string[]) {
  const { values } = parseCommand(args, target);
  const project = await resolveProject(services, session, values.project);
  const repository = await resolveRepository(services, session, project.id, values.repo);
  const environment = environmentOf(requireArg(values.env, 'environment', 'soja env create -p <project> [-r <repository>] -e <environment>'));
  await env.createVault(session, project.id, repository?.id ?? null, environment);
  const flags = `-p ${project.key}${repository ? ` -r ${repository.name}` : ''} -e ${environment}`;
  success(`${where(project, repository)} now has ${environment} variables. Add them with \`soja env set NAME ${flags}\`.`);
}

async function set(services: AppServices, env: EnvOperations, session: Session, args: string[]) {
  const { values, positionals } = parseCommand(args, target);
  const name = requireArg(positionals[0], 'variable name', 'soja env set NAME -p <project> [-r <repository>] -e <environment>  (the value is read from the keyboard or stdin)');
  if (positionals.length > 1) throw new ValidationError('Values are never taken as arguments: they would stay in your shell history.', { hint: `Run \`soja env set ${name} …\` and type it, or pipe it: \`printf %s "$VALUE" | soja env set ${name} …\`.` });
  const { vault, project } = await resolveVault(services, env, session, values);
  const value = await readSecret(`${name} (${project.name} · ${vault.environment}): `);
  await env.setVariable(session, vault, name, value);
  success(`${name} saved, encrypted, in ${project.name} ${vault.environment}.`);
}

async function remove(services: AppServices, env: EnvOperations, session: Session, args: string[]) {
  const { values, positionals } = parseCommand(args, target);
  const name = requireArg(positionals[0], 'variable name', 'soja env rm NAME -p <project> [-r <repository>] -e <environment>');
  const { vault, project } = await resolveVault(services, env, session, values);
  await env.removeVariable(session, vault.id, name);
  success(`${name} removed from ${project.name} ${vault.environment}.`);
}

async function grant(services: AppServices, env: EnvOperations, session: Session, args: string[]) {
  const { values, positionals } = parseCommand(args, { ...target, days: { type: 'string', short: 'd' } });
  const username = requireArg(positionals[0], 'person', 'soja env grant @user -p <project> [-r <repository>] -e <environment> --days 3|7|30');
  const days = Number(values.days ?? 7);
  if (!GRANT_DAYS.includes(days as GrantDays)) throw new ValidationError('Access lasts 3, 7 or 30 days.', { hint: 'Use --days 3, --days 7 or --days 30.' });
  const member = await memberNamed(services, session, username);
  const { vault, project } = await resolveVault(services, env, session, values);
  const result = await env.grant(session, vault, member.id, days as GrantDays);
  success(`@${member.username} can use ${project.name} ${vault.environment} until ${result.expiresAt.toLocaleString()}.`);
  if (!result.sealedFor && !result.waitingFor.length) print(dim(`  @${member.username} has not set up a device yet (\`soja env setup\`); run \`soja env share\` afterwards.`));
  for (const waiting of result.waitingFor) print(dim(`  Waiting for confirmation: ${waiting}. Compare it with them, then \`soja env trust <id>\` and \`soja env share\`.`));
}

async function revoke(services: AppServices, env: EnvOperations, session: Session, args: string[]) {
  const { values, positionals } = parseCommand(args, target);
  const username = requireArg(positionals[0], 'person', 'soja env revoke @user -p <project> [-r <repository>] -e <environment>');
  const member = await memberNamed(services, session, username);
  const { vault, project } = await resolveVault(services, env, session, values);
  const names = (await env.names(session, vault.id)).map((variable) => variable.name);
  await env.revoke(session, vault.id, member.id);
  const rotated = await env.rotate(session, vault);
  success(`@${member.username} can no longer use ${project.name} ${vault.environment}; the key was rotated (v${rotated.keyVersion}).`);
  if (names.length) {
    print(`  They saw these values while they had access. Change them at their source (the provider), then \`soja env set\` the new ones:`);
    print(`  ${names.join(', ')}`);
  }
}

async function share(services: AppServices, env: EnvOperations, session: Session, args: string[]) {
  const { values } = parseCommand(args, target);
  const { vault, project } = await resolveVault(services, env, session, values);
  const result = await env.sharePending(session, vault);
  success(result.sealed ? `Shared ${project.name} ${vault.environment} with ${result.sealed} device(s).` : 'No device was waiting.');
  for (const waiting of result.blocked) print(dim(`  Needs confirming first: ${waiting}.`));
}

async function rotate(services: AppServices, env: EnvOperations, session: Session, args: string[]) {
  const { values } = parseCommand(args, target);
  const { vault, project } = await resolveVault(services, env, session, values);
  const result = await env.rotate(session, vault);
  success(`${project.name} ${vault.environment} now uses key v${result.keyVersion}, shared with ${result.sealedFor} device(s).`);
  for (const waiting of result.blocked) print(dim(`  Not shared (needs confirming): ${waiting}.`));
}

async function history(services: AppServices, env: EnvOperations, session: Session, args: string[]) {
  const { values } = parseCommand(args, target);
  const { vault } = await resolveVault(services, env, session, values);
  for (const entry of await env.history(session, vault.id)) {
    print(`${dim(entry.createdAt.toLocaleString())} ${entry.actor ? `@${entry.actor}` : dim('someone')} ${entry.action.replaceAll('_', ' ')}${entry.subject ? ` @${entry.subject}` : ''}${entry.detail ? dim(` ${entry.detail}`) : ''}`);
  }
}

// ── Helpers ────────────────────────────────────────────────────────────

function environmentOf(value: string): EnvEnvironment {
  const aliases: Record<string, EnvEnvironment> = { dev: 'development', stage: 'staging', prod: 'production' };
  const environment = aliases[value.trim().toLowerCase()] ?? oneOf(value, ENV_ENVIRONMENTS, 'environment');
  if (!environment) throw new ValidationError('Missing environment.', { hint: `Use one of: ${ENV_ENVIRONMENTS.join(', ')}.` });
  return environment;
}

/** `-p KEY|name`, or the project linked to the repository you are in. */
async function resolveProject(services: AppServices, session: Session, query: string | undefined) {
  if (!query) {
    const here = await services.projects.findByRepository(session, process.cwd());
    if (!here) throw new ValidationError('Say which project: -p <key>.', { hint: 'Or run it inside a repository linked to the project.' });
    return here;
  }
  const wanted = query.trim().toLowerCase();
  const found = (await services.projects.list(session)).find((project) => project.key.toLowerCase() === wanted || project.name.toLowerCase() === wanted);
  if (!found) throw new ValidationError(`No project “${query}”.`, { hint: 'List them with `soja project list`.' });
  return found;
}

/** A repository of the project by name (`-r backend`); none means the whole project. */
async function resolveRepository(services: AppServices, session: Session, projectId: string, name: string | undefined) {
  if (!name) return null;
  const summary = (await services.projects.list(session)).find((project) => project.id === projectId);
  const wanted = name.trim().toLowerCase();
  const repository = summary?.repositories.find((candidate) => candidate.name.toLowerCase() === wanted);
  if (!repository) {
    const known = summary?.repositories.map((candidate) => candidate.name).join(', ');
    throw new ValidationError(`No repository “${name}” in this project.`, { hint: known ? `Repositories: ${known}. Without -r you use the variables of the whole project.` : 'Add repositories with `soja project repo add`.' });
  }
  return repository;
}

function where(project: { name: string }, repository: { name: string } | null): string {
  return repository ? `${project.name}/${repository.name}` : project.name;
}

async function resolveVault(services: AppServices, env: EnvOperations, session: Session, values: { project?: string | undefined; repo?: string | undefined; env?: string | undefined }) {
  const project = await resolveProject(services, session, values.project);
  const repository = await resolveRepository(services, session, project.id, values.repo);
  const environment = environmentOf(requireArg(values.env, 'environment', '-e development|staging|production'));
  const vault = (await env.vaults(session, project.id)).find((candidate) => candidate.environment === environment && candidate.repositoryId === (repository?.id ?? null));
  const label = where(project, repository);
  if (!vault) throw new ValidationError(`${label} has no ${environment} variables yet.`, { hint: `An owner creates them with \`soja env create -p ${project.key}${repository ? ` -r ${repository.name}` : ''} -e ${environment}\`.` });
  // Messages name the repository too; the vault keeps the scope this machine asked for.
  return { project: { ...project, name: label }, vault: { ...vault, projectId: project.id, repositoryId: repository?.id ?? null, environment } };
}

async function memberNamed(services: AppServices, session: Session, username: string) {
  const wanted = username.replace(/^@/, '').toLowerCase();
  const member = (await services.workspaces.members(session)).find((candidate) => candidate.username.toLowerCase() === wanted);
  if (!member) throw new ValidationError(`@${wanted} is not in this workspace.`, { hint: 'Add them with `soja workspace add <user>` first.' });
  return member;
}

/** Reads a secret without echoing it (keyboard) or from a pipe; never from arguments. */
async function readSecret(prompt: string): Promise<string> {
  const stdin = process.stdin;
  if (!stdin.isTTY) {
    const chunks: Buffer[] = [];
    for await (const chunk of stdin) chunks.push(Buffer.from(chunk as Buffer));
    return Buffer.concat(chunks).toString('utf8').replace(/\r?\n$/, '');
  }
  process.stderr.write(prompt);
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding('utf8');
  try {
    return await new Promise<string>((resolve, reject) => {
      let value = '';
      const onData = (chunk: string) => {
        for (const char of chunk) {
          if (char === '\r' || char === '\n') {
            stdin.off('data', onData);
            resolve(value);
            return;
          }
          if (char === '\u0003') {
            stdin.off('data', onData);
            reject(new SojaError('Cancelled.'));
            return;
          }
          if (char === '\u007f' || char === '\b') value = value.slice(0, -1);
          else if (char >= ' ') value += char;
        }
      };
      stdin.on('data', onData);
    });
  } finally {
    stdin.setRawMode(false);
    stdin.pause();
    process.stderr.write('\n');
  }
}
