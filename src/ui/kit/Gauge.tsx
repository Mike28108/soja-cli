import { Text } from 'ink';
import { palette, symbols } from '../theme/theme.js';

/** A thin progress bar: `████░░░░ 50%`. */
export function Gauge({ value, total, width = 10, color = palette.accent, showPercent = true }: { value: number; total: number; width?: number; color?: string; showPercent?: boolean }) {
  const ratio = total > 0 ? Math.max(0, Math.min(1, value / total)) : 0;
  const filled = Math.round(ratio * width);
  return (
    <Text>
      <Text color={color}>{symbols.full.repeat(filled)}</Text>
      <Text color={palette.border}>{symbols.shade.repeat(width - filled)}</Text>
      {showPercent ? <Text color={palette.muted}>{` ${String(Math.round(ratio * 100)).padStart(3)}%`}</Text> : null}
    </Text>
  );
}
