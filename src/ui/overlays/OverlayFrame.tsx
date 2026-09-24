import { Box, Text } from 'ink';
import type { ReactNode } from 'react';
import { Footer, type Hint } from '../components/Footer.js';
import { useLayout } from '../hooks/use-layout.js';
import { symbols } from '../theme/theme.js';

interface OverlayFrameProps {
  title: string;
  context?: string | undefined;
  hints: readonly Hint[];
  children: ReactNode;
}

/** Overlays take over the body (the header stays), so they work at any terminal size. */
export function OverlayFrame({ title, context, hints, children }: OverlayFrameProps) {
  const { width, height } = useLayout();
  return (
    <Box flexDirection="column" height={height + 2}>
      <Box flexDirection="column" height={height} overflow="hidden">
        <Box flexDirection="column" flexShrink={0}>
        <Text>
          <Text bold>{title}</Text>
          {context ? <Text dimColor>{` ${symbols.dot} ${context}`}</Text> : null}
        </Text>
        <Box marginTop={1} flexDirection="column">
          {children}
        </Box>
        </Box>
      </Box>
      <Footer hints={hints} width={width} />
    </Box>
  );
}

/** Rows available to overlay content below its title. */
export function useOverlayHeight(): number {
  return Math.max(3, useLayout().height - 2);
}
