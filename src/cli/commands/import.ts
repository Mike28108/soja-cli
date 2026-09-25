import { ValidationError } from '../../domain/errors.js';
import { symbols } from '../../ui/theme/theme.js';
import { bold, color, dim, print, success } from '../output.js';
import { confirm } from '../prompt.js';
import { withSession } from '../runtime.js';
import { parseCommand } from './args.js';

/** `soja import-local [--from <slug>] [--yes]`: brings local-mode history into the server workspace. */
export async function importLocalCommand(args: string[]): Promise<void> {
  const { values } = parseCommand(args, { from: { type: 'string' }, yes: { type: 'boolean', short: 'y' } });
  await withSession(async (services, session) => {
    const importer = services.importer;
    if (!importer) {
      throw new ValidationError('Importing sends your local data to a SOJA server, and SOJA is in local mode.', {
        hint: 'Sign in first: `soja login --server <url>`.',
      });
    }
    const options = values.from ? { from: values.from } : {};
    const preview = await importer.preview(session, options);
    print(`${bold('Import')} ${preview.from.name} ${dim(`(local)`)} ${symbols.arrow} ${bold(session.workspace.name)} ${dim(services.environment.mode === 'remote' ? `on ${new URL(services.environment.server).host}` : '')}`);
    print(`  ${preview.projects} projects ${symbols.dot} ${preview.tasks} tasks ${symbols.dot} ${preview.comments} comments ${symbols.dot} ${preview.activity} timeline events`);
    print(dim(`  Developers matched by username: ${preview.developers.map((name) => `@${name}`).join(', ') || 'none'}`));
    print(dim('  Your local data is only read; it stays as it is.'));
    if (preview.tasks === 0 && preview.projects === 0) return print(dim('Nothing to import.'));
    if (preview.alreadyImported) print(color('yellow', '! Already imported from this machine: importing again changes nothing.'));
    if (!(await confirm('Import now?', values.yes))) return print(dim('Cancelled.'));

    const outcome = await importer.run(session, options);
    if (preview.alreadyImported) return success('Already imported earlier: nothing changed.');
    success(`Imported ${outcome.tasks} tasks, ${outcome.projects} new projects, ${outcome.comments} comments and ${outcome.activity} timeline events`);
    const renumbered = Object.entries(outcome.renumbered);
    if (renumbered.length) {
      print(dim(`  Numbers changed because ${session.workspace.name} already had tasks:`));
      for (const [from, to] of renumbered.slice(0, 20)) print(`  SOJA-${from} ${symbols.arrow} ${bold(`SOJA-${to}`)}`);
      if (renumbered.length > 20) print(dim(`  ${symbols.ellipsis} and ${renumbered.length - 20} more`));
    }
    if (outcome.unmatchedUsers.length) {
      print(color('yellow', `! Not members of ${session.workspace.name}: ${outcome.unmatchedUsers.map((name) => `@${name}`).join(', ')}`));
      print(dim('  Their tasks and comments are attributed to you, and their assignments were left empty. Add them with `soja workspace add <username>`.'));
    }
    if (outcome.linkedFolders) print(dim(`  ${outcome.linkedFolders} project folder link${outcome.linkedFolders === 1 ? '' : 's'} kept on this machine.`));
  });
}
