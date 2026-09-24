import type { AppServices } from '../application/services/index.js';
import type { Session } from '../application/types.js';
import { bootstrap } from '../bootstrap.js';
import { SojaError } from '../domain/errors.js';

/** Opens the local database for one command and always closes it. */
export async function withServices<T>(work: (services: AppServices) => Promise<T>): Promise<T> {
  const runtime = await bootstrap();
  try {
    return await work(runtime.services);
  } finally {
    runtime.close();
  }
}

export async function withSession<T>(work: (services: AppServices, session: Session) => Promise<T>): Promise<T> {
  return withServices(async (services) => {
    const session = await services.session.current();
    if (!session) {
      throw new SojaError('SOJA is not set up yet.', { hint: 'Run `soja` once to create your user and workspace.' });
    }
    return work(services, session);
  });
}
