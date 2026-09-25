import { BackupService, restoreBackup, type Backup } from '../../application/services/backup-service.js';
import { activeDatabase, backupDir } from '../../bootstrap.js';
import { resolvePaths } from '../../config/paths.js';
import { ValidationError } from '../../domain/errors.js';
import { tildify } from '../../utils/text.js';
import { formatRelative } from '../../utils/time.js';
import { bold, color, dim, print, success } from '../output.js';
import { confirm } from '../prompt.js';
import { withServices } from '../runtime.js';
import { parseCommand, requireArg } from './args.js';

/** `soja backup [list | restore <name>]`: copies of the database in use. */
export async function backupCommand(args: string[]): Promise<void> {
  const [sub, ...rest] = args;
  if (sub === undefined || sub === 'now' || sub === 'create') return create();
  if (sub === 'list' || sub === 'ls') return list();
  if (sub === 'restore') return restore(rest);
  throw new ValidationError(`Unknown backup command “${sub}”.`, { hint: 'Try: soja backup, soja backup list, soja backup restore <name>.' });
}

async function create(): Promise<void> {
  await withServices(async (services) => {
    const backup = services.backups.create('manual');
    success(`Backup saved ${dim(`${tildify(backup.path)} · ${size(backup.bytes)}`)}`);
  });
}

async function list(): Promise<void> {
  const backups = lister().list();
  if (backups.length === 0) return print(dim('No backups yet. SOJA makes one a day when you open it; `soja backup` makes one now.'));
  for (const backup of backups) print(line(backup));
  print(dim(`  in ${tildify(backupDir(resolvePaths()))}`));
}

async function restore(args: string[]): Promise<void> {
  const { values, positionals } = parseCommand(args, { yes: { type: 'boolean', short: 'y' } });
  const name = requireArg(positionals[0], 'backup name', 'soja backup restore <name>  (names: soja backup list)');
  const paths = resolvePaths();
  const active = activeDatabase(paths);
  const backup = lister().find(name);
  print(`${bold('Restore')} ${backup.name} ${dim(`(${formatRelative(backup.createdAt)})`)}`);
  print(dim(`  It replaces ${tildify(active.file)}. The current state is saved first as a before-restore backup.`));
  if (active.label !== 'local') print(dim('  In remote mode this is the replica: the next sync brings back what the server has, and keeps your queued changes.'));
  if (!(await confirm('Restore it?', values.yes))) return print(dim('Cancelled.'));
  const saved = restoreBackup(backup, active.file, backupDir(paths), active.label);
  success(`Restored ${backup.name}`);
  if (saved) print(dim(`  Previous state kept as ${saved.name}`));
}

/** Lists without opening the database (restoring needs it closed). */
function lister(): BackupService {
  const paths = resolvePaths();
  const active = activeDatabase(paths);
  return new BackupService(
    {
      label: active.label,
      backupTo: () => {
        throw new Error('not used');
      },
    },
    backupDir(paths),
  );
}

function line(backup: Backup): string {
  const kind = backup.kind === 'auto' ? dim('daily') : backup.kind === 'manual' ? color('green', 'manual') : color('yellow', 'before restore');
  return `  ${backup.name.padEnd(58)} ${kind.padEnd(16)} ${dim(`${formatRelative(backup.createdAt)} · ${size(backup.bytes)}`)}`;
}

function size(bytes: number): string {
  return bytes > 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
