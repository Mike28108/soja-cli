import { Box, Text, type DOMElement } from 'ink';
import { useRef, type ReactNode } from 'react';
import { useAppState } from '../app-state.js';
import { useMeasure } from '../hooks/use-measure.js';
import { useTerminalSize } from '../hooks/use-terminal-size.js';
import { useHints, type Hint } from '../chrome/context.js';
import { Layer } from '../input/dispatcher.js';
import { Clickable } from '../kit/Clickable.js';
import { Panel } from '../kit/Panel.js';
import { palette } from '../theme/theme.js';

interface OverlayFrameProps {
  title: string;
  context?: string | undefined;
  hints: readonly Hint[];
  /** Preferred width; it shrinks on small terminals. */
  width?: number;
  children: ReactNode;
}

/**
 * A floating window over the screen, centered, on a raised surface. The
 * screen stays visible behind it; clicking outside closes it, like Esc.
 */
export function OverlayFrame({ title, context, hints, width = 76, children }: OverlayFrameProps) {
  useHints(hints);
  const { closeOverlay } = useAppState();
  const { columns, rows } = useTerminalSize();
  const ref = useRef<DOMElement>(null);
  const { height } = useMeasure(ref);
  const hasMeasured = height > 0;
  const shown = Math.min(width, columns - 4);
  const longContext = context !== undefined && context.length + title.length + 10 > shown;
  const top = hasMeasured ? Math.max(1, Math.floor((rows - height) / 2)) : 2;
  return (
    <>
      <Box position="absolute" top={0} left={0} width={columns} height={rows}>
        <Clickable onClick={() => closeOverlay()} layer={Layer.overlay} width={columns} flexGrow={1}>
          <Box width={columns} height={rows} />
        </Clickable>
      </Box>
      <Box ref={ref} position="absolute" top={top} left={Math.max(0, Math.floor((columns - shown) / 2))} width={shown} flexDirection="column">
        <Clickable onClick={() => undefined} layer={Layer.overlay} flexDirection="column">
          <Panel title={title} aside={longContext ? undefined : context} focused backgroundColor={palette.surface} width={shown}>
            <Box flexDirection="column" paddingY={0}>
              {/* A context too long for the border (warnings, what an action does) goes above the content, never dropped. */}
              {longContext ? (
                <Box marginBottom={1}>
                  <Text color={palette.muted}>{context}</Text>
                </Box>
              ) : null}
              {children}
            </Box>
          </Panel>
        </Clickable>
      </Box>
    </>
  );
}

/** Rows a window can give its list or content (the window floats with a margin). */
export function useOverlayHeight(): number {
  return Math.max(3, useTerminalSize().rows - 10);
}

/** Width available inside a window of `width` columns. */
export function useOverlayWidth(width = 76): number {
  return Math.max(20, Math.min(width, useTerminalSize().columns - 4) - 4);
}
