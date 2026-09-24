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
  ['task start <id>', 'Assign to yourself and move to In Progress (no Git)'],
  ['task done <id>', 'Mark as Done'],
  ['task reopen <id>', 'Move a closed task back to Todo'],
  ['project list', 'Projects with open work'],
  ['project create <name>', 'New project (--key, --repo-path, --repo-url)'],
  ['project link <key> [path|name]', 'Link a project to a local Git repository (default: here)'],
  ['project unlink <key>', 'Forget the linked repository'],
  ['start <id>', 'Task start + create/switch its Git branch (--from <ref>, --link)'],
  ['commit <id> -m <msg> [files|--all]', 'Commit on the task branch; adds (SOJA-12) to the message'],
  ['merge <id> [--delete] [--done]', 'Merge the task branch into its base (asks first)'],
  ['branch delete <id> [--force]', 'Delete the task branch (asks first)'],
  ['push <id>', 'Push the task branch to origin'],
  ['pr <id>', 'Push and open a pull request with the GitHub CLI (asks first)'],
  ['pr status <id>', 'The task PR on GitHub: state, review and checks'],
  ['pr merge <id> [--delete-branch]', 'Merge the PR on GitHub and mark the task Done (asks first)'],
  ['login --server <url>', 'Sign in to a SOJA server with GitHub (remote mode)'],
  ['logout', 'Sign out and go back to local mode'],
  ['mode [local|remote]', 'Show or switch where SOJA keeps data'],
  ['whoami', 'Current user, workspace and mode'],
  ['sync [--dismiss]', 'Sync now (remote mode); shows conflicts and rejected changes'],
  ['chat [#channel]', 'Open the team chat (remote mode)'],
  ['chat send #channel <text|->', 'Send a message; - reads it from stdin (scripts, hooks)'],
  ['chat log [#channel] [-n 20]', 'Latest messages of a channel'],
  ['chat channels', 'Channels with unread messages and mentions'],
  ['chat new <name> [--topic]', 'Create a channel'],
  ['folders [list]', 'Parent folders and their subfolders, like ls -1'],
  ['folders add|remove <path>', 'Register or forget a folder that contains repositories'],
  ['workspace list', 'Your workspaces'],
  ['workspace create <name>', 'New workspace (you are the owner)'],
  ['workspace add <username>', 'Add a developer to the active workspace'],
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
