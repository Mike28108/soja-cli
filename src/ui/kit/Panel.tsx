import { Box, Text, type DOMElement } from 'ink';
import { useRef, type ReactNode } from 'react';
import { useMeasure } from '../hooks/use-measure.js';
import { useTerminalSize } from '../hooks/use-terminal-size.js';
import { palette } from '../theme/theme.js';

interface PanelProps {
  /** Shown inside the top border: `╭─ Title ───╮`. */
  title?: string | undefined;
  /** Right side of the top border, e.g. a count. */
  aside?: string | undefined;
  /** Highlighted border: the panel you are working in. */
  focused?: boolean;
  width?: number | string;
  height?: number;
  flexGrow?: number;
  flexShrink?: number;
  /** Background of the whole panel (floating windows). */
  backgroundColor?: string | undefined;
  paddingX?: number;
  children: ReactNode;
}

/**
 * A rounded box with its title in the border, the basic block of every
 * screen. The top border is drawn by hand so the title can sit in it.
 */
export function Panel({ title, aside, focused = false, width, height, flexGrow, flexShrink, backgroundColor, paddingX = 1, children }: PanelProps) {
  const ref = useRef<DOMElement>(null);
  // Re-render on resize so the drawn border follows the new width.
  useTerminalSize();
  const { width: measured } = useMeasure(ref);
  const border = focused ? palette.borderFocus : palette.border;
  return (
    <Box
      ref={ref}
      flexDirection="column"
      {...(width !== undefined ? { width } : {})}
      {...(height !== undefined ? { height } : {})}
      {...(flexGrow !== undefined ? { flexGrow } : {})}
      {...(flexShrink !== undefined ? { flexShrink } : {})}
      {...(backgroundColor ? { backgroundColor } : {})}
    >
      {/* Clipped so the drawn border can never widen the panel it is measured from. */}
      <Box width="100%" height={1} overflow="hidden" flexShrink={0}>
        <TopBorder width={typeof width === 'number' ? width : measured} title={title} aside={aside} color={border} focused={focused} backgroundColor={backgroundColor} />
      </Box>
      <Box
        flexDirection="column"
        flexGrow={1}
        // With a fixed panel height the body gets an exact one, so what does not fit is clipped inside the border.
        {...(height !== undefined ? { height: Math.max(1, height - 1) } : {})}
        borderStyle="round"
        borderTop={false}
        borderColor={border}
        paddingX={paddingX}
        overflow="hidden"
        {...(backgroundColor ? { borderBottomBackgroundColor: backgroundColor, borderLeftBackgroundColor: backgroundColor, borderRightBackgroundColor: backgroundColor } : {})}
      >
        {/* Content keeps its natural height and is clipped, never squeezed into overlapping rows. */}
        <Box flexDirection="column" flexShrink={0} flexGrow={1}>
          {children}
        </Box>
      </Box>
    </Box>
  );
}

function TopBorder({
  width,
  title,
  aside,
  color,
  focused,
  backgroundColor,
}: {
  width: number;
  title: string | undefined;
  aside: string | undefined;
  color: string;
  focused: boolean;
  backgroundColor: string | undefined;
}) {
  const inner = Math.max(0, width - 2);
  const left = title ? ` ${title} ` : '';
  const right = aside ? ` ${aside} ` : '';
  // Keep "─" on both sides of the title; drop the aside first when narrow.
  const fitsAside = left.length + right.length + 3 <= inner;
  const shownRight = fitsAside ? right : '';
  const shownLeft = left.length + 2 > inner ? left.slice(0, Math.max(0, inner - 3)) : left;
  const fill = Math.max(0, inner - 1 - shownLeft.length - shownRight.length - (shownRight ? 1 : 0));
  const background = backgroundColor ? { backgroundColor } : {};
  return (
    <Text wrap="truncate" {...background}>
      <Text color={color}>{`╭─`}</Text>
      {shownLeft ? (
        <Text color={focused ? palette.accent : palette.text} bold>
          {shownLeft}
        </Text>
      ) : null}
      <Text color={color}>{'─'.repeat(fill)}</Text>
      {shownRight ? (
        <>
          <Text color={palette.muted}>{shownRight}</Text>
          <Text color={color}>─</Text>
        </>
      ) : null}
      <Text color={color}>╮</Text>
    </Text>
  );
}
