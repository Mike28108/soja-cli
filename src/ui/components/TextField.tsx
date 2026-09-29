import { Box, Text } from 'ink';
import { palette } from '../theme/theme.js';
import { TextInput } from './TextInput.js';

/**
 * A text box that looks like a form field: a filled line with the cursor,
 * an optional label above it. Editing rules are TextInput's.
 */
export function TextField({
  value,
  onChange,
  placeholder,
  active = true,
  label,
  width,
  mask = false,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string | undefined;
  active?: boolean;
  label?: string | undefined;
  width?: number;
  mask?: boolean;
}) {
  return (
    <Box flexDirection="column">
      {label ? <Text color={active ? palette.accent : palette.muted}>{label}</Text> : null}
      <Box backgroundColor={palette.neutralSoft} paddingX={1} {...(width ? { width } : {})}>
        <TextInput value={value} onChange={onChange} placeholder={placeholder} active={active} prompt={active ? '›' : ' '} mask={mask} />
      </Box>
    </Box>
  );
}
