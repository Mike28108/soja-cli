import { Text, useAnimation } from 'ink';
import { palette } from '../theme/theme.js';

const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

/** Work in progress (syncing, talking to Git or GitHub). */
export function Spinner({ label, color = palette.accent }: { label?: string; color?: string }) {
  const { frame } = useAnimation({ interval: 80 });
  return (
    <Text>
      <Text color={color}>{FRAMES[frame % FRAMES.length]}</Text>
      {label ? <Text color={palette.muted}>{` ${label}`}</Text> : null}
    </Text>
  );
}
