import type { AppServices } from '../application/services/index.js';
import type { Session } from '../application/types.js';
import { bootstrap } from '../bootstrap.js';
import { SojaError } from '../domain/errors.js';
import { paint } from './output.js';

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
    // Remote mode: pull before (fresh data) and push after (your changes). Offline still works.
    const sync = services.sync;
    if (sync) await sync.syncNow(session.workspace.id);
    const result = await work(services, session);
    if (sync) {
      const report = await sync.syncNow(session.workspace.id);
      const status = await sync.status(session.workspace.id);
      if (!report.online) printStatus(`offline · ${plural(status.pending, 'change')} queued, sent when you reconnect`);
      else if (status.pending > 0) printStatus(`${plural(status.pending, 'change')} not synced yet: ${report.error ?? 'will retry'}`);
      if (report.conflicts || report.rejected || report.chatRejected) printStatus('some changes need your attention: run `soja sync`');
    }
    return result;
  });
}

function printStatus(text: string): void {
  process.stderr.write(`${paint('dim', `⇅ ${text}`, process.stderr)}\n`);
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}
