import { Box, Text } from 'ink';
import type { Flash } from '../app-state.js';
import { palette, symbols, toneColors } from '../theme/theme.js';

/** The latest confirmation or error, floating above the status bar at the bottom right. */
export function Toast({ flash, columns, rows }: { flash: Flash; columns: number; rows: number }) {
  const tone = flash.tone === 'error' ? 'danger' : flash.tone === 'success' ? 'success' : 'info';
  const { fg } = toneColors(tone);
  const mark = flash.tone === 'error' ? symbols.cross : flash.tone === 'success' ? symbols.check : symbols.info;
  const width = Math.min(columns - 4, Math.max(28, Math.min(64, Math.max(flash.text.length, flash.hint?.length ?? 0) + 8)));
  return (
    <Box
      position="absolute"
      top={Math.max(1, rows - (flash.hint ? 6 : 5))}
      left={Math.max(0, columns - width - 2)}
      width={width}
      borderStyle="round"
      borderColor={fg}
      backgroundColor={palette.surface}
      flexDirection="column"
      paddingX={1}
    >
      <Text backgroundColor={palette.surface} wrap="truncate-end">
        <Text color={fg} bold>{`${mark} `}</Text>
        <Text color={palette.text}>{flash.text}</Text>
      </Text>
      {flash.hint ? (
        <Text backgroundColor={palette.surface} color={palette.muted} wrap="truncate-end">
          {`  ${flash.hint}`}
        </Text>
      ) : null}
    </Box>
  );
}
