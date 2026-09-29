#!/usr/bin/env node
import { ValidationError } from '../domain/errors.js';
import { toDisplayError } from '../utils/errors.js';
import { deleteAccountCommand, loginCommand, logoutCommand, modeCommand, whoamiCommand } from './commands/account.js';
import { accessCommand } from './commands/access.js';
import { devCommand } from './commands/dev.js';
import { foldersCommand } from './commands/folders.js';
import { backupCommand } from './commands/backup.js';
import { updateCommand } from './commands/update.js';
import { chatCommand } from './commands/chat.js';
import { importLocalCommand } from './commands/import.js';
import { branchCommand, commitCommand, mergeCommand, pullRequestCommand, pushCommand } from './commands/git-ops.js';
import { printHelp, printVersion } from './commands/info.js';
import { mouseCommand } from './commands/preferences.js';
import { envCommand } from './commands/env.js';
import { runCommand } from './commands/run.js';
import { projectCommand } from './commands/project.js';
import { taskCommand } from './commands/task.js';
import { startCommand } from './commands/start.js';
import { syncCommand } from './commands/sync.js';
import { runInterface } from './commands/tui.js';
import { switchWorkspace, workspaceCommand } from './commands/workspace.js';
import { printError } from './output.js';

async function main(argv: string[]): Promise<void> {
  const [command, ...rest] = argv;
  switch (command) {
    case undefined:
      return runInterface();
    case '-h':
    case '--help':
    case 'help':
      return printHelp();
    case '-v':
    case '--version':
    case 'version':
      return printVersion();
    case 'task':
    case 'tasks':
    case 't':
      return taskCommand(rest);
    case 'project':
    case 'projects':
      return projectCommand(rest);
    case 'workspace':
    case 'workspaces':
      return workspaceCommand(rest);
    case 'use':
      return switchWorkspace(rest);
    case 'start':
      return startCommand(rest);
    case 'folders':
    case 'folder':
      return foldersCommand(rest);
    case 'commit':
      return commitCommand(rest);
    case 'merge':
      return mergeCommand(rest);
    case 'branch':
      return branchCommand(rest);
    case 'push':
      return pushCommand(rest);
    case 'pr':
      return pullRequestCommand(rest);
    case 'dev':
      return devCommand(rest);
    case 'login':
      return loginCommand(rest);
    case 'access':
      return accessCommand(rest);
    case 'logout':
      return logoutCommand();
    case 'account':
      if (rest[0] === 'delete') return deleteAccountCommand(rest.slice(1));
      throw new ValidationError('Use `soja account delete [--yes]`.');
    case 'whoami':
      return whoamiCommand();
    case 'mode':
      return modeCommand(rest);
    case 'mouse':
      return mouseCommand(rest);
    case 'env':
      return envCommand(rest);
    case 'run':
      return runCommand(rest);
    case 'sync':
      return syncCommand(rest);
    case 'chat':
      return chatCommand(rest);
    case 'import-local':
      return importLocalCommand(rest);
    case 'backup':
    case 'backups':
      return backupCommand(rest);
    case 'update':
    case 'upgrade':
      return updateCommand(rest);
    default:
      throw new ValidationError(`Unknown command “${command}”.`, { hint: 'See `soja --help`.' });
  }
}

// `soja task list | head` closes the pipe early; that is not an error. Stop
// writing but let the command finish: in remote mode it still has to sync.
process.stdout.on('error', (error: NodeJS.ErrnoException) => {
  if (error.code !== 'EPIPE') throw error;
  process.stdout.write = (() => true) as typeof process.stdout.write;
});

main(process.argv.slice(2)).catch((error: unknown) => {
  printError(toDisplayError(error));
  process.exitCode = 1;
});
