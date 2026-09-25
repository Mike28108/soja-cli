import { Text } from 'ink';
import { toneColors, type Tone } from '../theme/theme.js';

/** A filled label: ` IN PROGRESS `. The soft background keeps it readable in light and dark terminals. */
export function Badge({ tone, children, bold = false }: { tone: Tone; children: string; bold?: boolean }) {
  const { fg, bg } = toneColors(tone);
  return (
    <Text backgroundColor={bg} color={fg} bold={bold}>
      {` ${children} `}
    </Text>
  );
}
