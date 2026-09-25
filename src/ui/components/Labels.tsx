import { Text } from 'ink';
import type { TaskPriority, TaskStatus } from '../../domain/task.js';
import { palette, priorityStyles, priorityTone, statusStyles, statusTone, toneColors } from '../theme/theme.js';

const LEVEL: Record<TaskPriority, number> = { none: 0, low: 1, medium: 2, high: 3, urgent: 4 };

/** Priority as a small meter: `▰▰▰▱ HIGH`. The label can be dropped when space is short. */
export function PriorityMeter({ priority, label = true, background }: { priority: TaskPriority; label?: boolean; background?: string | undefined }) {
  const { fg } = toneColors(priorityTone[priority]);
  const level = LEVEL[priority];
  const bg = background ? { backgroundColor: background } : {};
  return (
    <Text {...bg}>
      <Text color={level === 0 ? palette.faint : fg}>{'▰'.repeat(level)}</Text>
      <Text color={palette.faint}>{'▱'.repeat(4 - level)}</Text>
      {label ? (
        <Text color={level === 0 ? palette.faint : fg} bold={priority === 'urgent'}>{` ${priority === 'none' ? '—' : priorityStyles[priority].label}`}</Text>
      ) : null}
    </Text>
  );
}

/** Status as a soft filled label: ` ◐ In Progress `, or only its glyph when narrow. */
export function StatusBadge({ status, glyphOnly = false }: { status: TaskStatus; glyphOnly?: boolean }) {
  const style = statusStyles[status];
  const { fg, bg } = toneColors(statusTone[status]);
  const color = status === 'todo' ? palette.text : fg;
  return (
    <Text backgroundColor={bg} color={color} strikethrough={status === 'cancelled'}>
      {glyphOnly ? ` ${style.glyph} ` : ` ${style.glyph} ${style.label} `}
    </Text>
  );
}

/** Kept for places that show priority as a word (task detail header). */
export function PriorityLabel({ priority }: { priority: TaskPriority }) {
  return <PriorityMeter priority={priority} />;
}

export function StatusLabel({ status, glyphOnly = false }: { status: TaskStatus; glyphOnly?: boolean }) {
  return <StatusBadge status={status} glyphOnly={glyphOnly} />;
}
