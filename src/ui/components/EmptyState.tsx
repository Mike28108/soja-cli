import { Box, Text } from 'ink';
import { palette } from '../theme/theme.js';

/** Centered in the space it gets: the fact in normal text, the rest dimmer and with a little personality. */
export function EmptyState({ lines, icon = '◌' }: { lines: readonly string[]; icon?: string }) {
  const [first, ...rest] = lines;
  return (
    <Box flexDirection="column" alignItems="center" justifyContent="center" flexGrow={1} paddingY={1}>
      <Text color={palette.faint}>{icon}</Text>
      <Text color={palette.text} bold>
        {first}
      </Text>
      {rest.filter(Boolean).map((line) => (
        <Text key={line} color={palette.muted}>
          {line}
        </Text>
      ))}
    </Box>
  );
}
