import { FileConfigStore } from '../../config/config.js';
import { CredentialStore } from '../../config/credentials.js';
import { resolvePaths } from '../../config/paths.js';
import { ApiClient } from '../../data/remote/api-client.js';
import { requestAccess } from './account.js';
import { SojaError, ValidationError } from '../../domain/errors.js';
import type { User } from '../../domain/entities.js';
import { bold, dim, print, success } from '../output.js';
import { parseCommand } from './args.js';

const stores = () => {
  const paths = resolvePaths();
  return { config: new FileConfigStore(paths.configFile), credentials: new CredentialStore(paths.credentialsFile) };
};

export async function accessCommand(args: string[]): Promise<void> {
  const { positionals } = parseCommand(args, {});
  const action = positionals[0] ?? 'status';
  const { config, credentials } = stores();
  const settings = config.load()?.remote;
  const token = settings ? credentials.token(settings.apiUrl) : null;
  if (!settings || !token) throw new SojaError('No hay una sesión GitHub de SOJA guardada.', { hint: 'Ejecuta `soja login --server <url>`.' });
  const api = new ApiClient(settings.apiUrl, token);

  if (action === 'status') {
    const [state, profile] = await Promise.all([
      api.get<{ status: string; request: { submittedAt: string } | null }>('/v1/access-request'),
      api.get<{ user: { isCeo?: boolean } }>('/v1/profile'),
    ]);
    print(`Acceso Online: ${bold(state.status)}${profile.user.isCeo ? ` ${bold('CEO de SOJA')}` : ''}`);
    if (state.request) print(dim(`Solicitud enviada: ${state.request.submittedAt}`));
    return;
  }
  if (action === 'request') {
    const { user } = await api.get<{ user: User & { accessStatus?: 'pending' | 'approved' | 'rejected' } }>('/v1/profile');
    await requestAccess(api, user);
    return;
  }
  if (action === 'approvals') {
    const result = await api.get<{ requests: { id: string; username: string; displayName: string; countryCode: string | null; letter: string; submittedAt: string }[] }>('/v1/admin/access-requests');
    if (!result.requests.length) { print('No hay solicitudes pendientes.'); return; }
    for (const request of result.requests) {
      print(`${bold(`@${request.username}`)} · ${request.displayName} · ${request.countryCode ?? 'sin país'}`);
      print(`  ${request.letter} ${dim(`(${request.submittedAt})`)}`);
      print(`  ID: ${request.id}`);
    }
    print(dim('Usa `soja access approve <id>` o `soja access reject <id>`.'));
    return;
  }
  if (action === 'approve' || action === 'reject') {
    const id = positionals[1];
    if (!id) throw new ValidationError(`Indica el ID: soja access ${action} <id>`);
    const result = await api.post<{ status: string }>(`/v1/admin/access-requests/${id}/${action}`);
    success(`Solicitud ${result.status}.`);
    return;
  }
  throw new ValidationError('Usa `soja access status|request|approvals|approve <id>|reject <id>`.');
}
