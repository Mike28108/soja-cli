import { existsSync, rmSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';
import { resolvePaths } from '../../config/paths.js';
import { ValidationError } from '../../domain/errors.js';
import { seedDemoData } from '../../dev/seed.js';
import { bold, dim, print, success } from '../output.js';
import { withServices } from '../runtime.js';
import { parseCommand } from './args.js';

/** Developer tooling behind `npm run db:*`. Not part of the everyday CLI. */
export async function devCommand(args: string[]): Promise<void> {
  const [sub, ...rest] = args;
  switch (sub) {
    case 'migrate':
      // Opening the database applies pending migrations.
      await withServices(async () => undefined);
      success(`Database is up to date ${dim(resolvePaths().databaseFile)}`);
      return;
    case 'seed':
      await withServices(async (services) => {
        if (services.environment.mode === 'remote') {
          throw new ValidationError('Demo data is only for local mode.', { hint: 'Run `soja mode local` first.' });
        }
        const result = await seedDemoData(services);
        success(`Seeded ${bold(result.session.workspace.name)}: ${result.projects} projects, ${result.tasks} tasks`);
        print(dim(`  You are @${result.session.user.username}. Run \`npm run dev\` to look around.`));
      });
      return;
    case 'reset':
      return reset(rest);
    default:
      throw new ValidationError(`Unknown dev command “${sub ?? ''}”.`, { hint: 'Try: migrate, seed, reset.' });
  }
}

async function reset(args: string[]): Promise<void> {
  const { values } = parseCommand(args, { yes: { type: 'boolean', short: 'y' } });
  const paths = resolvePaths();
  const targets = [paths.databaseFile, `${paths.databaseFile}-wal`, `${paths.databaseFile}-shm`, paths.configFile].filter(
    (file) => existsSync(file),
  );
  if (targets.length === 0) {
    print(dim('Nothing to reset.'));
    return;
  }

  print(bold('This permanently deletes:'));
  for (const file of targets) print(`  ${file}`);
  if (!values.yes) {
    if (!process.stdin.isTTY) throw new ValidationError('Refusing to reset without confirmation.', { hint: 'Pass --yes.' });
    const readline = createInterface({ input: process.stdin, output: process.stdout });
    const answer = await readline.question('Type "reset" to continue: ');
    readline.close();
    if (answer.trim() !== 'reset') {
      print(dim('Cancelled. Nothing was deleted.'));
      return;
    }
  }
  for (const file of targets) rmSync(file, { force: true });
  success('Reset. The next `soja` starts from first-run setup.');
}
