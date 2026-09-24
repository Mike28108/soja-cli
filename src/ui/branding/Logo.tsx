import { Box, Text } from 'ink';
import { brandGradient, palette } from '../theme/theme.js';
import { WORDMARK, WORDMARK_CURSOR } from './brand.js';

/** Colors a line column by column so the gradient runs left to right across the mark. */
function gradientSegments(line: string): { text: string; color: string }[] {
  const width = WORDMARK[0]?.length ?? line.length;
  const segments: { text: string; color: string }[] = [];
  for (const [index, char] of [...line].entries()) {
    const color = brandGradient[Math.min(brandGradient.length - 1, Math.floor((index / width) * brandGradient.length))];
    const last = segments.at(-1);
    if (last && last.color === color) last.text += char;
    else segments.push({ text: char, color: color ?? palette.accent });
  }
  return segments;
}

/** The full SOJA wordmark with its trailing terminal cursor. */
export function Logo({ cursorVisible = true }: { cursorVisible?: boolean }) {
  return (
    <Box flexDirection="column">
      {WORDMARK.map((line, row) => (
        <Text key={row}>
          {gradientSegments(line).map((segment, index) => (
            <Text key={index} color={segment.color}>
              {segment.text}
            </Text>
          ))}
          {row === WORDMARK.length - 1 ? (
            <Text color={palette.accent}>{cursorVisible ? ` ${WORDMARK_CURSOR}` : ''}</Text>
          ) : null}
        </Text>
      ))}
    </Box>
  );
}
