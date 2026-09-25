import { Box, Text } from 'ink';
import { palette } from '../theme/theme.js';
import { Clickable } from './Clickable.js';

export interface TabItem<T extends string> {
  value: T;
  label: string;
  /** Small count after the label. */
  count?: number | undefined;
  /** Keyboard shortcut shown before the label when there is room. */
  shortcut?: string | undefined;
}

/** Filled pill for the active tab, muted text for the rest; each one clickable. */
export function Tabs<T extends string>({
  items,
  value,
  onChange,
  active = true,
  compact = false,
}: {
  items: readonly TabItem<T>[];
  value: T | null;
  onChange: (value: T) => void;
  active?: boolean;
  compact?: boolean;
}) {
  return (
    <Box gap={compact ? 0 : 1} flexWrap="nowrap">
      {items.map((item) => {
        const selected = item.value === value;
        const text = `${!compact && item.shortcut ? `${item.shortcut} ` : ''}${item.label}${item.count !== undefined ? ` ${item.count}` : ''}`;
        return (
          <Clickable key={item.value} onClick={() => onChange(item.value)} active={active}>
            <Text
              {...(selected ? { backgroundColor: palette.accent, color: palette.onAccent, bold: true } : { color: palette.muted })}
            >{` ${text} `}</Text>
          </Clickable>
        );
      })}
    </Box>
  );
}
