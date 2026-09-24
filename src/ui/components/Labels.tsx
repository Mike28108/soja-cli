import { Text } from 'ink';
import type { TaskPriority, TaskStatus } from '../../domain/task.js';
import { priorityStyles, statusStyles } from '../theme/theme.js';

export function PriorityLabel({ priority }: { priority: TaskPriority }) {
  const style = priorityStyles[priority];
  return (
    <Text color={style.color} bold={style.bold} dimColor={style.dim}>
      {style.label}
    </Text>
  );
}

export function StatusLabel({ status, glyphOnly = false }: { status: TaskStatus; glyphOnly?: boolean }) {
  const style = statusStyles[status];
  return (
    <Text color={style.color} dimColor={style.dim}>
      {glyphOnly ? style.glyph : `${style.glyph} ${style.label}`}
    </Text>
  );
}
