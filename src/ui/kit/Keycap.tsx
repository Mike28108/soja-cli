import { Text } from 'ink';
import { palette } from '../theme/theme.js';

/** A key drawn like a keyboard key, followed by what it does: `[ enter ] open`. */
export function Keycap({ keys, label }: { keys: string; label?: string }) {
  return (
    <Text>
      <Text backgroundColor={palette.neutralSoft} color={palette.text} bold>{` ${keys} `}</Text>
      {label ? <Text color={palette.muted}>{` ${label}`}</Text> : null}
    </Text>
  );
}
