import { ValidationError } from '../../domain/errors.js';
import { symbols } from '../../ui/theme/theme.js';
import { tildify } from '../../utils/text.js';
import { bold, color, dim, print, success } from '../output.js';
import { withServices, withSession } from '../runtime.js';
import { parseCommand, requireArg } from './args.js';

/** `soja folders`: parent folders that contain your repositories. */
export async function foldersCommand(args: string[]): Promise<void> {
  const [sub, ...rest] = args;
  if (sub === undefined || sub === 'list' || sub === 'ls') return list();
  if (sub === 'add') return add(rest);
  if (sub === 'remove' || sub === 'rm') return remove(rest);
  throw new ValidationError(`Unknown folders command “${sub}”.`, { hint: 'Try: list, add <path>, remove <path>.' });
}

/** Parent folders and their subfolders, like `ls -1`, marking repositories and linked projects. */
async function list(): Promise<void> {
  await withSession(async (services, session) => {
    const parents = services.folders.browse();
    if (parents.length === 0) {
      print(dim('No parent folders yet. Add one with `soja folders add ~/workspace/products`.'));
      return;
    }
    const linked = new Map(
      (await services.projects.list(session)).flatMap((project) =>
        project.repositoryPath ? [[project.repositoryPath, project.key] as const] : [],
      ),
    );
    for (const [index, parent] of parents.entries()) {
      if (index > 0) print();
      print(`${bold(tildify(parent.path))}${parent.available ? '' : dim('  (not found)')}`);
      for (const child of parent.children) {
        const key = linked.get(child.path);
        const mark = child.isGitRepository ? color('green', symbols.active) : dim(symbols.dot);
        print(`  ${mark} ${child.isGitRepository ? child.name : dim(child.name)}${key ? dim(`  ${symbols.arrow} ${key}`) : ''}`);
      }
      if (parent.available && parent.children.length === 0) print(dim('  (empty)'));
    }
    print();
    print(dim(`${color('green', symbols.active)} Git repository   ${symbols.arrow} linked project`));
  });
}

async function add(args: string[]): Promise<void> {
  const { positionals } = parseCommand(args, {});
  const path = requireArg(positionals.join(' '), 'folder', 'soja folders add ~/workspace/products');
  await withServices(async (services) => {
    const folders = services.folders.add(path);
    success(`Parent folder added ${dim(`(${folders.length} total)`)}`);
    print(dim('  See its subfolders with `soja folders list`.'));
  });
}

async function remove(args: string[]): Promise<void> {
  const { positionals } = parseCommand(args, {});
  const path = requireArg(positionals.join(' '), 'folder', 'soja folders remove ~/workspace/products');
  await withServices(async (services) => {
    services.folders.remove(path);
    success('Parent folder removed. Nothing was deleted from disk.');
  });
}
