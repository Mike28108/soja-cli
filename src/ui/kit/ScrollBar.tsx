import { Box, Text } from 'ink';
import { palette } from '../theme/theme.js';

/** A one-column scroll indicator: where the visible rows are within the whole list. Nothing when it all fits. */
export function ScrollBar({ total, visible, offset, height }: { total: number; visible: number; offset: number; height: number }) {
  if (total <= visible || height <= 0) return null;
  const thumb = Math.max(1, Math.round((visible / total) * height));
  const start = Math.min(height - thumb, Math.round((offset / Math.max(1, total - visible)) * (height - thumb)));
  return (
    <Box flexDirection="column" width={1} flexShrink={0}>
      {Array.from({ length: height }, (_, row) => {
        const inThumb = row >= start && row < start + thumb;
        return (
          <Text key={row} color={inThumb ? palette.muted : palette.border}>
            {inThumb ? '┃' : '│'}
          </Text>
        );
      })}
    </Box>
  );
}

