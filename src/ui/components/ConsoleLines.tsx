import { Text } from 'ink';
import type { ConsoleLine } from '../../git/console.js';
import { palette } from '../theme/theme.js';

/** Git console lines: commands stand out, Git's chatter is dim, results are colored. */
export function ConsoleLines({ lines }: { lines: readonly ConsoleLine[] }) {
  return (
    <>
      {lines.map((line) => (
        <Text
          key={line.id}
          wrap="truncate-end"
          bold={line.kind === 'command'}
          color={
            line.kind === 'command'
              ? palette.accent
              : line.kind === 'error'
                ? palette.danger
                : line.kind === 'success'
                  ? palette.success
                  : undefined
          }
          dimColor={line.kind === 'stdout' || line.kind === 'stderr' || line.kind === 'info'}
        >
          {line.kind === 'command' ? line.text : `  ${line.text}`}
        </Text>
      ))}
    </>
  );
}
