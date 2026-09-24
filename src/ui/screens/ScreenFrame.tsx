import { Box } from 'ink';
import type { ReactNode } from 'react';
import { Footer, type Hint } from '../components/Footer.js';
import { useLayout } from '../hooks/use-layout.js';

/** Body + contextual footer. Body height is fixed so the footer never jumps. */
export function ScreenFrame({ hints, children }: { hints: readonly Hint[]; children: ReactNode }) {
  const { width, height } = useLayout();
  return (
    <Box flexDirection="column" height={height + 2}>
      <Box flexDirection="column" height={height} overflow="hidden">
        {/* Content keeps its natural height and is clipped, never squeezed into overlapping rows. */}
        <Box flexDirection="column" flexShrink={0}>
          {children}
        </Box>
      </Box>
      <Footer hints={hints} width={width} />
    </Box>
  );
}
