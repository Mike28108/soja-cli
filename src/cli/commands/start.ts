import { statusStyles, symbols } from '../../ui/theme/theme.js';
import { bold, color, dim, print, success, token } from '../output.js';
import { withSession } from '../runtime.js';
import { tildify } from '../../utils/text.js';
import { parseCommand, requireArg } from './args.js';

/** `soja start <id>`: the Git flow on top of `soja task start`. */
export async function startCommand(args: string[]): Promise<void> {
  const { values, positionals } = parseCommand(args, {
    from: { type: 'string', short: 'f' },
    link: { type: 'boolean', short: 'l' },
  });
  const ref = requireArg(positionals[0], 'task ID', 'soja start SOJA-12 [--from main] [--link]');

  await withSession(async (services, session) => {
    const result = await services.git.start(session, ref, {
      cwd: process.cwd(),
      from: values.from,
      link: values.link ?? false,
    });
    const status = statusStyles[result.task.status];
    success(`${bold(result.task.ref)} ${symbols.arrow} ${token(status, status.label)}  ${dim(result.task.title)}`);

    const where = dim(`in ${tildify(result.root)}`);
    const lines: Record<typeof result.action, string> = {
      created: `created ${color('green', result.branch)}${result.base ? dim(` from ${result.base}`) : ''} ${where}`,
      recreated: `recreated ${color('green', result.branch)}${result.base ? dim(` from ${result.base}`) : ''} ${where}`,
      switched: `switched to ${color('green', result.branch)} ${where}`,
      current: `already on ${color('green', result.branch)} ${where}`,
    };
    print(`  ${lines[result.action]}`);
    if (result.carried > 0) print(dim(`  ${result.carried} uncommitted change${result.carried === 1 ? '' : 's'} came along`));
    if (result.linked) print(dim(`  linked ${result.task.project?.name ?? 'the project'} to this repository`));
  });
}
