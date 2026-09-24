import { Box, Text } from 'ink';
import { useAppState } from '../app-state.js';
import { palette, symbols } from '../theme/theme.js';

export type Hint = readonly [keys: string, action: string];

/**
 * Context shortcuts, or the latest confirmation/error while it is fresh.
 * Hints that do not fit the width are dropped from the end.
 */
export function Footer({ hints, width }: { hints: readonly Hint[]; width: number }) {
  const { flash } = useAppState();

  if (flash) {
    const color = flash.tone === 'error' ? palette.danger : flash.tone === 'success' ? palette.success : undefined;
    const mark = flash.tone === 'error' ? symbols.cross : flash.tone === 'success' ? symbols.check : symbols.dot;
    return (
      <Box marginTop={1}>
        <Text wrap="truncate-end">
          <Text color={color}>{`${mark} ${flash.text}`}</Text>
          {flash.hint ? <Text dimColor>{`  ${flash.hint}`}</Text> : null}
        </Text>
      </Box>
    );
  }

  const shown: Hint[] = [];
  let used = 0;
  for (const hint of hints) {
    const size = hint[0].length + hint[1].length + 4;
    if (used + size > width) break;
    shown.push(hint);
    used += size;
  }
  return (
    <Box marginTop={1} gap={3}>
      {shown.map(([keys, action]) => (
        <Text key={keys}>
          <Text bold>{keys}</Text>
          <Text dimColor> {action}</Text>
        </Text>
      ))}
    </Box>
  );
}
