import { APP_AUTHOR, APP_DESCRIPTION, APP_NAME, APP_SLOGAN, APP_VERSION } from '../../ui/branding/brand.js';
import { bold, color, dim, print } from '../output.js';

export function printVersion(): void {
  print(`${bold(APP_NAME)} ${color('green', `v${APP_VERSION}`)}`);
  print(APP_DESCRIPTION);
  print(dim(APP_AUTHOR));
}

const COMMANDS: readonly (readonly [string, string])[] = [
  ['task list', 'Your open tasks (--all, --status <s>, --project <key>)'],
  ['task create <title>', 'New task (--project, --type, --priority, --assignee, --requester)'],
  ['task show <id>', 'Details, activity and comments'],
  ['task start <id>', 'Assign to yourself and move to In Progress'],
  ['task done <id>', 'Mark as Done'],
  ['task reopen <id>', 'Move a closed task back to Todo'],
  ['project list', 'Projects with open work'],
  ['project create <name>', 'New project (--key, --repo-path, --repo-url)'],
  ['workspace list', 'Your workspaces'],
  ['use <workspace>', 'Switch the active workspace'],
];

export function printHelp(): void {
  print(`${bold(APP_NAME)}${color('green', '▁')}  ${dim(`v${APP_VERSION}`)}`);
  print(APP_DESCRIPTION);
  print();
  print(dim(APP_SLOGAN));
  print();
  print(bold('Usage'));
  print(`  soja                   ${dim('Open the interface')}`);
  print(`  soja <command> [options]`);
  print();
  print(bold('Commands'));
  const width = Math.max(...COMMANDS.map(([command]) => command.length)) + 3;
  for (const [command, description] of COMMANDS) print(`  ${command.padEnd(width)}${dim(description)}`);
  print();
  print(bold('Options'));
  print(`  -h, --help${' '.repeat(width - 10)}${dim('Show this help')}`);
  print(`  -v, --version${' '.repeat(width - 13)}${dim('Show the version')}`);
  print();
  print(dim(`Task IDs look like SOJA-12. Debug output: SOJA_DEBUG=1 soja …`));
}
