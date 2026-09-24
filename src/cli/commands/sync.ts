import { ValidationError } from '../../domain/errors.js';
import { formatRelative } from '../../utils/time.js';
import { bold, color, dim, print, success } from '../output.js';
import { withServices } from '../runtime.js';
import { parseCommand } from './args.js';

/** `soja sync [--dismiss]`: sync now, then show what needs attention (remote mode). */
export async function syncCommand(args: string[]): Promise<void> {
  const { values } = parseCommand(args, { dismiss: { type: 'boolean' } });
  await withServices(async (services) => {
    const sync = services.sync;
    if (!sync) throw new ValidationError('SOJA is in local mode; there is nothing to sync.', { hint: '`soja login --server <url>` to work with a team.' });
    const session = await services.session.current();
    if (!session) return;
    const workspaceId = session.workspace.id;

    const report = await sync.syncNow(workspaceId);
    const status = await sync.status(workspaceId);
    if (!report.online) print(color('yellow', `Offline. ${status.pending} change${status.pending === 1 ? '' : 's'} queued; they are sent when you reconnect.`));
    else if (report.error) print(color('yellow', `Synced partially: ${report.error}`));
    else success(`Synced ${bold(session.workspace.name)} ${dim(`· sent ${report.pushed}, received ${report.pulledTasks} task update${report.pulledTasks === 1 ? '' : 's'}${report.pulledMessages ? ` and ${report.pulledMessages} message${report.pulledMessages === 1 ? '' : 's'}` : ''}`)}`);
    if (status.lastSyncAt) print(dim(`  last sync ${formatRelative(status.lastSyncAt)}`));

    const notices = await sync.notices(workspaceId);
    if (notices.length === 0) return;
    print();
    print(bold('Needs your attention'));
    for (const notice of notices) {
      print(`  ${notice.kind === 'conflict' ? color('yellow', '!') : color('red', '✕')} ${notice.message}`);
      if (notice.kind === 'conflict' && notice.field) {
        print(dim(`    restore it: soja task show ${notice.taskRef}, then edit ${notice.field}; or dismiss with \`soja sync --dismiss\``));
      }
      if (values.dismiss) await sync.dismissNotice(notice.id);
    }
    if (values.dismiss) print(dim('  Dismissed.'));
  });
}
