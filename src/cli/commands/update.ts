import { createUpdater } from '../../bootstrap.js';
import { bold, color, dim, print, success } from '../output.js';
import { confirm } from '../prompt.js';
import { parseCommand } from './args.js';

/** `soja update [--check] [--yes]`: installs the newest release with gh and npm. */
export async function updateCommand(args: string[]): Promise<void> {
  const { values } = parseCommand(args, { check: { type: 'boolean' }, yes: { type: 'boolean', short: 'y' } });
  const updater = createUpdater();
  const found = await updater.check();
  if (!found.available) return success(`SOJA ${bold(`v${found.current}`)} is the latest version.`);
  print(`${color('green', `SOJA v${found.latest}`)} is available ${dim(`(you have v${found.current})`)}`);
  print(dim(`  Package details: npm view soja-cli@${found.latest}`));
  if (values.check) return;
  if (!(await confirm('Install it now?', values.yes))) return print(dim('Cancelled.'));
  await updater.install(found.latest);
  success(`Installed SOJA v${found.latest}. Your data and settings stay as they are.`);
}
