import { existsSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { FileConfigStore } from '../../config/config.js';
import { CredentialStore, normalize } from '../../config/credentials.js';
import { resolvePaths } from '../../config/paths.js';
import { DEFAULT_SERVER_URL, isSecureServerUrl } from '../../config/server.js';
import { ApiClient } from '../../data/remote/api-client.js';
import type { WorkspaceWithRole } from '../../data/repositories.js';
import type { User } from '../../domain/entities.js';
import { SojaError, ValidationError } from '../../domain/errors.js';
import { symbols } from '../../ui/theme/theme.js';
import { bold, color, dim, print, success } from '../output.js';
import { withSession } from '../runtime.js';
import { parseCommand } from './args.js';
import { confirmTyped } from '../prompt.js';

interface DeviceStart {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  interval: number;
  expiresIn: number;
}

interface OnboardingUser extends User { accessStatus?: 'pending' | 'approved' | 'rejected'; isCeo?: boolean }

async function ask(question: string): Promise<string> {
  if (!stdin.isTTY) throw new ValidationError('El alta de acceso necesita una terminal interactiva.');
  const rl = createInterface({ input: stdin, output: stdout });
  try { return (await rl.question(question)).trim(); } finally { rl.close(); }
}

export async function requestAccess(api: ApiClient, user: OnboardingUser): Promise<void> {
  const current = await api.get<{ profile: { displayName: string; dateOfBirth: string | null; countryCode: string | null } | null; request: { letter: string } | null }>('/v1/access-request');
  const countries = await api.get<{ countries: { code: string; name: string; flag: string }[] }>('/v1/auth/countries');
  const displayName = await ask(`Nombre [${current.profile?.displayName ?? user.displayName}]: `) || current.profile?.displayName || user.displayName;
  const dateOfBirth = await ask('Fecha de nacimiento (AAAA-MM-DD): ');
  const letter = await ask('¿Por qué te interesa SOJA? (máximo 100 caracteres): ');
  if (Array.from(letter).length > 100) throw new ValidationError('La carta no puede superar 100 caracteres.');
  const search = await ask('País (escribe para filtrar): ');
  const matches = countries.countries.filter((country) => country.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()));
  if (!matches.length) throw new ValidationError('No encontré países con ese texto. Ejecuta de nuevo `soja login`.');
  matches.slice(0, 12).forEach((country, index) => print(`  ${index + 1}. ${country.flag} ${country.name} (${country.code})`));
  const selected = Number(await ask('Elige el número del país: '));
  const country = matches[selected - 1];
  if (!country || selected > 12) throw new ValidationError('Selecciona uno de los países mostrados.');
  const result = await api.post<{ status: string }>('/v1/access-request', { displayName, dateOfBirth, countryCode: country.code, letter });
  print(result.status === 'approved' ? 'Acceso aprobado.' : 'Solicitud enviada. Tu sesión queda limitada hasta que el CEO la apruebe.');
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
  const server = normalize(values.server ?? current?.remote?.apiUrl ?? DEFAULT_SERVER_URL);
  if (!isSecureServerUrl(server)) {
    throw new ValidationError('La URL del servidor SOJA debe usar HTTPS.', { hint: 'HTTP solo se permite en localhost para desarrollo. Usa `soja login --server <url>` para indicar otro servidor.' });
  }

  const api = new ApiClient(server, null);
  const health = await api.get<{ status?: string; version?: string }>('/v1/health').catch((error: unknown) => {
    throw new SojaError(`${server} does not look like a SOJA server.`, {
      hint: 'Use the base URL of your soja-backend, e.g. https://soja-backend-production.up.railway.app',
      cause: error,
    });
  });
  if (health?.status !== 'ok') {
    throw new SojaError(`${server} does not look like a SOJA server.`, { hint: 'Its /v1/health did not answer {"status":"ok"}.' });
  }
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

    const signedInUser = poll.body.user as OnboardingUser;
    const accountApi = new ApiClient(server, poll.body.token);
    const account = await accountApi.get<{ user: OnboardingUser; workspaces: WorkspaceWithRole[] }>('/v1/me');
    if (account.user.accessStatus !== 'approved') {
      credentials.save(server, poll.body.token, signedInUser.username);
      config.save({ parentFolders: [], ...current, mode: 'local', remote: { apiUrl: server, userId: signedInUser.id } });
      print(`Sesión GitHub iniciada como ${bold(`@${signedInUser.username}`)}. Estado: ${account.user.accessStatus ?? 'pending'}.`);
      if (account.user.accessStatus !== 'rejected') await requestAccess(accountApi, signedInUser);
      print(dim('SOJA permanece en modo local hasta la aprobación. Consulta `soja access status`.'));
      return;
    }

    const sameServer = current?.remote?.apiUrl === server;
    credentials.save(server, poll.body.token, signedInUser.username);
    config.save({
      parentFolders: [],
      ...current,
      mode: 'remote',
      remote: {
        apiUrl: server,
        userId: signedInUser.id,
        ...(sameServer && current?.remote?.workspaceId ? { workspaceId: current.remote.workspaceId } : {}),
      },
    });
    success(`Signed in as ${bold(`@${signedInUser.username}`)} ${dim(`on ${server}`)}`);

    const { workspaces } = account;
    if (workspaces.length > 1) {
      workspaces.forEach((workspace, index) => print(`  ${index + 1}. ${workspace.name}`));
      const choice = Number(await ask('Selecciona el workspace para entrar: '));
      const workspace = workspaces[choice - 1];
      if (!workspace) throw new ValidationError('Selecciona un workspace válido.');
      const saved = config.load();
      if (!saved?.remote) throw new SojaError('No se pudo guardar el workspace seleccionado.');
      config.save({ ...saved, remote: { ...saved.remote, workspaceId: workspace.id } });
    }
    if (workspaces.length === 0) print(dim('  No workspaces yet. Create one: soja workspace create "Bravos Development"'));
    else print(dim(`  Workspaces: ${workspaces.map((workspace) => workspace.name).join(', ')}`));
    print(dim('  SOJA now uses this server. `soja mode local` switches back to your local data.'));
    // Local work can come along (it is only read, never moved).
    if (existsSync(resolvePaths().databaseFile)) print(dim('  To bring your local projects and tasks to the team: soja import-local'));
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

/** `soja account delete`: revokes sessions and anonymizes shared authorship. */
export async function deleteAccountCommand(args: string[]): Promise<void> {
  const { values } = parseCommand(args, { yes: { type: 'boolean', short: 'y' } });
  const { config, credentials } = stores();
  const current = config.load();
  const server = current?.remote?.apiUrl;
  const token = server ? credentials.token(server) : null;
  if (!server || !token) throw new SojaError('No hay una cuenta SOJA Online activa para borrar.', { hint: 'Inicia sesión primero con `soja login`.' });
  if (!(await confirmTyped('Esto revoca todas tus sesiones y anonimiza tu perfil en el contenido compartido.', 'BORRAR', values.yes))) return print(dim('Cancelado.'));
  await new ApiClient(server, token).delete('/v1/account');
  credentials.remove(server);
  if (current) config.save({ ...current, mode: 'local' });
  success('Cuenta eliminada. El contenido compartido se conserva con autoría anonimizada.');
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
