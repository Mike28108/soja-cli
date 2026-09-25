import { Box, Text } from 'ink';
import type { ConsoleLine } from '../../git/console.js';
import { palette } from '../theme/theme.js';

/**
 * Git console lines on an inset like a small terminal: commands stand out,
 * Git's chatter is dim, results are colored.
 */
export function ConsoleLines({ lines, minRows = 0 }: { lines: readonly ConsoleLine[]; minRows?: number }) {
  return (
    <Box flexDirection="column" backgroundColor={palette.bar} paddingX={1} minHeight={minRows}>
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
                  : palette.muted
          }
        >
          {line.kind === 'command' ? line.text : `  ${line.text}`}
        </Text>
      ))}
    </Box>
  );
}
