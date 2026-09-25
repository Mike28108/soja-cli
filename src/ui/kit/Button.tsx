import { Text } from 'ink';
import { palette, toneColors, type Tone } from '../theme/theme.js';
import { Layer } from '../input/dispatcher.js';
import { Clickable } from './Clickable.js';

/** `[ Delete ]`: a clickable action in a window. `primary` is filled; `focused` shows which one Enter picks. */
export function Button({
  label,
  onPress,
  variant = 'default',
  tone,
  focused = false,
  layer = Layer.overlay,
}: {
  label: string;
  onPress: () => void;
  variant?: 'default' | 'primary';
  tone?: Tone;
  focused?: boolean;
  layer?: Layer;
}) {
  const colors = tone ? toneColors(tone) : null;
  const filled = variant === 'primary' || focused;
  const background = filled ? (colors?.fg ?? palette.accent) : palette.neutralSoft;
  const foreground = filled ? palette.onAccent : (colors?.fg ?? palette.text);
  return (
    <Clickable onClick={onPress} layer={layer}>
      <Text backgroundColor={background} color={foreground} bold={filled}>{`  ${label}  `}</Text>
    </Clickable>
  );
}
