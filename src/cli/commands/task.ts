import { createInterface } from 'node:readline/promises';
import { FILTER_LABELS, type TaskFilter } from '../../application/filters.js';
import type { AppServices } from '../../application/services/index.js';
import type { Session, TaskDetails } from '../../application/types.js';
import { ValidationError } from '../../domain/errors.js';
import { activeCount, countStatuses, TASK_PRIORITIES, TASK_STATUSES, TASK_TYPES, TYPE_LABELS } from '../../domain/task.js';
import { priorityStyles, statusStyles, symbols } from '../../ui/theme/theme.js';
import { clampLines, wrapText } from '../../utils/text.js';
import { formatRelative, formatStamp } from '../../utils/time.js';
import type { TaskGitState } from '../../application/services/index.js';
import { tildify } from '../../utils/text.js';
import { bold, color, dim, print, success, taskLine, token } from '../output.js';
import { withSession } from '../runtime.js';
import { oneOf, parseCommand, requireArg } from './args.js';

export async function taskCommand(args: string[]): Promise<void> {
  const [sub, ...rest] = args;
  switch (sub) {
    case undefined:
    case 'list':
    case 'ls':
      return list(rest);
    case 'create':
    case 'new':
    case 'add':
      return create(rest);
    case 'show':
    case 'view':
      return show(rest);
    case 'done':
    case 'start':
    case 'reopen':
      return transition(sub, rest);
    default:
      throw new ValidationError(`Unknown task command “${sub}”.`, { hint: 'Try: list, create, show, start, done, reopen.' });
  }
}

async function list(args: string[]): Promise<void> {
  const { values } = parseCommand(args, {
    all: { type: 'boolean', short: 'A' },
    status: { type: 'string', short: 's' },
    project: { type: 'string', short: 'p' },
  });
  const status = oneOf(values.status, ['todo', 'in_progress', 'review', 'blocked', 'done'] as const, 'status');
  const filter: TaskFilter = status ?? (values.all ? 'all' : 'mine');

  await withSession(async (services, session) => {
    await reportMerges(services, session);
    const project = values.project ? await services.projects.resolve(session, values.project) : null;
    const tasks = await services.tasks.list(session, filter, project ? { projectId: project.id } : {});
    const heading = filter === 'mine' ? 'MY WORK' : FILTER_LABELS[filter].toUpperCase();
    print(`${bold(heading)}  ${dim([session.workspace.name, project?.name].filter(Boolean).join(' / '))}`);
    print();
    if (tasks.length === 0) {
      print(dim(filter === 'mine' ? "  No tasks assigned. You're free." : '  Nothing here.'));
      return;
    }
    for (const task of tasks) print(taskLine(task, { showAssignee: filter !== 'mine' }));
    print();
    const counts = countStatuses(tasks);
    print(
      dim(
        filter === 'done'
          ? `${tasks.length} done`
          : `${activeCount(counts)} active ${symbols.dot} ${counts.in_progress} in progress ${symbols.dot} ${counts.review} review ${symbols.dot} ${counts.blocked} blocked`,
      ),
    );
  });
}

async function create(args: string[]): Promise<void> {
  const { values, positionals } = parseCommand(args, {
    project: { type: 'string', short: 'p' },
    type: { type: 'string', short: 't' },
    priority: { type: 'string', short: 'P' },
    status: { type: 'string', short: 's' },
    assignee: { type: 'string', short: 'a' },
    requester: { type: 'string', short: 'r' },
    description: { type: 'string', short: 'd' },
  });
  const type = oneOf(values.type, TASK_TYPES, 'type');
  const priority = oneOf(values.priority, TASK_PRIORITIES, 'priority');
  const status = oneOf(values.status, TASK_STATUSES, 'status');
  const title = positionals.join(' ').trim() || (await askTitle());

  await withSession(async (services, session) => {
    // Inside a linked repository, its project is the default.
    const project = values.project
      ? await services.projects.resolve(session, values.project)
      : await services.projects.findByRepository(session, process.cwd());
    const projectId = project?.id ?? null;
    const assigneeId = await resolveAssignee(services, session, values.assignee);
    const created = await services.tasks.create(session, {
      title,
      projectId,
      ...(type ? { type } : {}),
      ...(priority ? { priority } : {}),
      ...(status ? { status } : {}),
      ...(assigneeId !== undefined ? { assigneeId } : {}),
      requester: values.requester ?? null,
      description: values.description ?? null,
    });
    // Remote mode: send it now so the real number shows when online (offline it stays SOJA-?n).
    if (services.sync) await services.sync.syncNow(session.workspace.id);
    const task = services.sync ? await services.tasks.get(session, created) : created;
    success(`Created ${bold(task.ref)}  ${task.title}`);
    const details = [
      task.project?.name,
      token(priorityStyles[task.priority]),
      task.assignee ? `@${task.assignee.username}` : 'unassigned',
      task.requester ? `for ${task.requester}` : undefined,
    ];
    print(dim(`  ${details.filter(Boolean).join(`  ${symbols.dot}  `)}`));
  });
}

async function resolveAssignee(services: AppServices, session: Session, value: string | undefined) {
  if (value === undefined) return undefined;
  if (['none', 'nobody', '-'].includes(value.toLowerCase())) return null;
  if (['me', '@me'].includes(value.toLowerCase())) return session.user.id;
  return (await services.workspaces.findMember(session, value)).id;
}

async function askTitle(): Promise<string> {
  if (!process.stdin.isTTY) {
    throw new ValidationError('A task needs a title.', { hint: 'Usage: soja task create "Fix Stripe webhook"' });
  }
  const readline = createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await readline.question(`${bold('Title')} ${color('green', '›')} `)).trim();
  } finally {
    readline.close();
  }
}

async function show(args: string[]): Promise<void> {
  const { positionals } = parseCommand(args, {});
  const ref = requireArg(positionals[0], 'task ID', 'soja task show SOJA-12');
  await withSession(async (services, session) => {
    await reportMerges(services, session, ref);
    const task = await services.tasks.get(session, ref);
    printDetails(task);
    printGit(task.ref, await services.git.inspect(session, task, process.cwd()));
  });
}

function printDetails(task: TaskDetails): void {
  const width = Math.min(process.stdout.columns || 80, 100) - 2;
  const status = statusStyles[task.status];
  print(`${color('green', bold(task.ref))}  ${dim(TYPE_LABELS[task.type])}`);
  print(bold(task.title));
  print(`${token(status, `${status.glyph} ${status.label}`)}   ${token(priorityStyles[task.priority])}`);
  print();
  const field = (label: string, value: string | null | undefined, hint?: string) =>
    print(`${dim(label.padEnd(14))}${value ?? dim('—')}${hint ? dim(`  ${hint}`) : ''}`);
  field('Project', task.project?.name);
  field('Assignee', task.assignee ? `@${task.assignee.username}` : null, task.assignee?.displayName);
  field('Requested by', task.requester);
  field('Branch', task.branch, task.branch ? undefined : `suggested ${task.suggestedBranch}`);
  field('Created', formatStamp(task.createdAt), task.creator ? `by @${task.creator.username}` : undefined);
  print();
  if (task.description) for (const line of wrapText(task.description, width - 2)) print(`  ${line}`);
  else print(dim('  No description.'));
  print();
  print(dim(bold('ACTIVITY')));
  const actorWidth = Math.min(18, Math.max(8, ...task.timeline.map((entry) => (entry.actor?.username.length ?? 0) + 1)) + 2);
  for (const entry of task.timeline) {
    const prefix = `${dim(formatStamp(entry.at).padEnd(7))}${(entry.actor ? `@${entry.actor.username}` : '').padEnd(actorWidth)}`;
    if (entry.kind === 'event') print(`${prefix}${dim(entry.text)}`);
    else {
      const [first, ...more] = clampLines(wrapText(entry.body, Math.max(20, width - 9 - actorWidth)), 6);
      print(`${prefix}${color('green', symbols.comment)} ${first ?? ''}`);
      for (const line of more) print(`${' '.repeat(7 + actorWidth + 2)}${line}`);
    }
  }
}

/** Closes tasks whose branch was merged outside SOJA and says so before the output. */
async function reportMerges(services: AppServices, session: Session, only?: string): Promise<void> {
  const results = await services.git.detectMerges(session, process.cwd(), only ? { only } : {}).catch(() => []);
  for (const result of results) {
    if (result.kind === 'merged') success(`${bold(result.task.ref)} was merged into ${result.into} outside SOJA ${symbols.arrow} Done`);
    else print(dim(`${result.task.ref}: branch ${result.branch} was deleted with no merge found`));
  }
  if (results.length) print();
}

function printGit(ref: string, state: TaskGitState): void {
  print();
  print(dim(bold('GIT')));
  if (state.status === 'unavailable') {
    print(dim(`  ${state.reason}${state.hint ? `  ${state.hint}` : ''}`));
    return;
  }
  const where = dim(`in ${tildify(state.root)}`);
  if (!state.branchExists) {
    print(`  ${dim(state.recorded ? 'branch deleted, no merge found:' : 'not started:')} ${state.branch} ${where}`);
    print(dim(`  run \`soja start ${ref}\` to create it${state.recorded ? ', or forget it from the Git menu (g)' : ''}`));
  } else {
    const checkout = state.checkedOut
      ? color('green', `${symbols.active} checked out`)
      : dim(`not checked out (on ${state.currentBranch ?? 'detached HEAD'})`);
    print(`  ${state.branch}  ${checkout}  ${where}`);
  }
  if (state.uncommitted > 0) print(dim(`  ${state.uncommitted} uncommitted change${state.uncommitted === 1 ? '' : 's'}`));
  for (const commit of state.commits.slice(0, 5)) {
    print(`  ${color('yellow', commit.shortHash)} ${commit.subject} ${dim(`${commit.author}, ${formatRelative(commit.date)}`)}`);
  }
  if (state.commits.length > 5) print(dim(`  ${symbols.ellipsis} ${state.commits.length - 5} more`));
}

async function transition(action: 'done' | 'start' | 'reopen', args: string[]): Promise<void> {
  const { positionals } = parseCommand(args, {});
  const ref = requireArg(positionals[0], 'task ID', `soja task ${action} SOJA-12`);
  await withSession(async (services, session) => {
    const task =
      action === 'done'
        ? await services.tasks.complete(session, ref)
        : action === 'start'
          ? await services.tasks.start(session, ref)
          : await services.tasks.reopen(session, ref);
    const status = statusStyles[task.status];
    success(`${bold(task.ref)} ${symbols.arrow} ${token(status, status.label)}  ${dim(task.title)}`);
  });
}
