import { Box, Text } from 'ink';

/** First line states the fact; the rest is dimmer and may have a little personality. */
export function EmptyState({ lines }: { lines: readonly string[] }) {
  const [first, ...rest] = lines;
  return (
    <Box flexDirection="column" paddingLeft={2} paddingTop={1}>
      <Text>{first}</Text>
      {rest.map((line) => (
        <Text key={line} dimColor>
          {line}
        </Text>
      ))}
    </Box>
  );
}
