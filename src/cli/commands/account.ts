import { FileConfigStore } from '../../config/config.js';
import { CredentialStore, normalize } from '../../config/credentials.js';
import { resolvePaths } from '../../config/paths.js';
import { ApiClient } from '../../data/remote/api-client.js';
import type { WorkspaceWithRole } from '../../data/repositories.js';
import type { User } from '../../domain/entities.js';
import { SojaError, ValidationError } from '../../domain/errors.js';
import { symbols } from '../../ui/theme/theme.js';
import { bold, color, dim, print, success } from '../output.js';
import { withSession } from '../runtime.js';
import { parseCommand } from './args.js';

interface DeviceStart {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  interval: number;
  expiresIn: number;
}

const stores = () => {
  const paths = resolvePaths();
  return { config: new FileConfigStore(paths.configFile), credentials: new CredentialStore(paths.credentialsFile) };
};

const sleep = (seconds: number) => new Promise((resolve) => setTimeout(resolve, seconds * 1000));

/** `soja login --server <url>`: GitHub device flow through the SOJA server; switches to remote mode. */
export async function loginCommand(args: string[]): Promise<void> {
  const { values } = parseCommand(args, { server: { type: 'string', short: 's' } });
  const { config, credentials } = stores();
  const current = config.load();
  const server = normalize(values.server ?? current?.remote?.apiUrl ?? '');
  if (!/^https?:\/\//.test(server)) {
    throw new ValidationError('Which SOJA server?', { hint: 'soja login --server https://your-soja-server' });
  }

  const api = new ApiClient(server, null);
  const health = await api.get<{ version: string }>('/v1/health');
  const start = await api.post<DeviceStart>('/v1/auth/device');
  print(`${bold('Sign in with GitHub')} ${dim(`(SOJA server ${health.version} at ${server})`)}`);
  print();
  print(`  1. Open   ${color('cyan', start.verificationUri)}`);
  print(`  2. Enter  ${bold(color('green', start.userCode))}`);
  print();
  print(dim('Waiting for approval… (ctrl+c to cancel)'));

  let interval = start.interval;
  const deadline = Date.now() + start.expiresIn * 1000;
  while (Date.now() < deadline) {
    await sleep(interval);
    const poll = await api.postWithStatus<{ status: string; token?: string; user?: User }>('/v1/auth/device/token', {
      deviceCode: start.deviceCode,
    });
    if (poll.status === 202) {
      if (poll.body.status === 'slow_down') interval += 5;
      continue;
    }
    if (!poll.body.token || !poll.body.user) throw new SojaError('The server did not return a session.');

    const sameServer = current?.remote?.apiUrl === server;
    credentials.save(server, poll.body.token, poll.body.user.username);
    config.save({
      parentFolders: [],
      ...current,
      mode: 'remote',
      remote: {
        apiUrl: server,
        userId: poll.body.user.id,
        ...(sameServer && current?.remote?.workspaceId ? { workspaceId: current.remote.workspaceId } : {}),
      },
    });
    success(`Signed in as ${bold(`@${poll.body.user.username}`)} ${dim(`on ${server}`)}`);

    const { workspaces } = await new ApiClient(server, poll.body.token).get<{ workspaces: WorkspaceWithRole[] }>('/v1/me');
    if (workspaces.length === 0) print(dim('  No workspaces yet. Create one: soja workspace create "Bravos Development"'));
    else print(dim(`  Workspaces: ${workspaces.map((workspace) => workspace.name).join(', ')}`));
    print(dim('  SOJA now uses this server. `soja mode local` switches back to your local data.'));
    return;
  }
  throw new SojaError('The login code expired before it was approved.', { hint: 'Run `soja login` again.' });
}

/** `soja logout`: revokes the session on the server and returns to local mode. */
export async function logoutCommand(): Promise<void> {
  const { config, credentials } = stores();
  const current = config.load();
  const server = current?.remote?.apiUrl;
  if (!server) {
    print(dim('Not signed in to any SOJA server.'));
    return;
  }
  const token = credentials.token(server);
  if (token) await new ApiClient(server, token).post('/v1/auth/logout').catch(() => undefined);
  credentials.remove(server);
  if (current) config.save({ ...current, mode: 'local' });
  success(`Signed out of ${server}. SOJA is back in local mode.`);
}

/** `soja mode [local|remote]`: shows or switches where SOJA reads and writes. */
export async function modeCommand(args: string[]): Promise<void> {
  const { positionals } = parseCommand(args, {});
  const { config, credentials } = stores();
  const current = config.load();
  const target = positionals[0];
  if (!target) {
    print(current?.mode === 'remote' ? `remote ${dim(current.remote?.apiUrl ?? '')}` : 'local');
    return;
  }
  if (target !== 'local' && target !== 'remote') throw new ValidationError('Use `soja mode local` or `soja mode remote`.');
  if (target === 'remote' && (!current?.remote || !credentials.token(current.remote.apiUrl))) {
    throw new SojaError('No SOJA server to switch to.', { hint: 'Run `soja login --server <url>` first.' });
  }
  if (!current) throw new SojaError('SOJA is not set up yet.', { hint: 'Run `soja` once, or `soja login --server <url>`.' });
  config.save({ ...current, mode: target });
  success(`SOJA is in ${bold(target)} mode${target === 'remote' ? dim(` (${current.remote?.apiUrl})`) : ''}.`);
}

/** `soja whoami` */
export async function whoamiCommand(): Promise<void> {
  await withSession(async (services, session) => {
    const where = services.environment.mode === 'remote' ? `remote ${dim(services.environment.server)}` : 'local';
    print(`${bold(`@${session.user.username}`)} ${dim(session.user.displayName)}`);
    print(`  ${dim('workspace')} ${session.workspace.name}`);
    print(`  ${dim('mode')}      ${where}`);
    print(dim(`  ${symbols.dot} switch with \`soja mode local|remote\``));
  });
}
