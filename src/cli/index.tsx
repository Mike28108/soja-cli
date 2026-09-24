#!/usr/bin/env node
import { ValidationError } from '../domain/errors.js';
import { toDisplayError } from '../utils/errors.js';
import { devCommand } from './commands/dev.js';
import { printHelp, printVersion } from './commands/info.js';
import { projectCommand } from './commands/project.js';
import { taskCommand } from './commands/task.js';
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
    case 'dev':
      return devCommand(rest);
    default:
      throw new ValidationError(`Unknown command “${command}”.`, { hint: 'See `soja --help`.' });
  }
}

main(process.argv.slice(2)).catch((error: unknown) => {
  printError(toDisplayError(error));
  process.exitCode = 1;
});
