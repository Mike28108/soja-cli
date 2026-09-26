import { Box, Text } from 'ink';
import { Clickable } from '../kit/Clickable.js';
import { palette, symbols } from '../theme/theme.js';
import type { Hint } from './context.js';
import { APP_SLOGAN, WORDMARK_WIDTH } from '../branding/brand.js';
import { Logo } from '../branding/Logo.js';
import { FOOTER_BRAND_GAP_ROWS, footerRowsFor } from '../hooks/use-layout.js';

/** The mouse switch at the end of the bar: `M` works always, a click only while the mouse is on. */
export interface MouseSwitchProps {
  on: boolean;
  onToggle: () => void;
  /** False while a window is open: the click belongs to the window. */
  active: boolean;
}

const mouseLabel = (on: boolean) => ` ${on ? symbols.active : symbols.inactive} mouse ${on ? 'on' : 'off'} `;

/**
 * The bottom bar: a pill with where you are, then the shortcuts that work
 * right now as keys. Shortcuts that do not fit are dropped from the end.
 */
export function StatusBar({ columns, mode, hints, right, mouse }: { columns: number; mode: string; hints: readonly Hint[]; right?: string | undefined; mouse?: MouseSwitchProps | undefined }) {
  const footerRows = footerRowsFor(columns);
  const inlineBrand = columns >= WORDMARK_WIDTH + APP_SLOGAN.length + 4;
  const sloganWidth = inlineBrand ? columns - WORDMARK_WIDTH - 4 : columns - 2;
  const mouseWidth = mouse ? mouseLabel(mouse.on).length + 4 : 0;
  const available = columns - mode.length - 4 - (right ? right.length + 3 : 0) - mouseWidth;
  const shown: Hint[] = [];
  let used = 0;
  for (const hint of hints) {
    const size = hint[0].length + hint[1].length + 4;
    if (used + size > available) break;
    shown.push(hint);
    used += size;
  }
  return (
    <Box width={columns} height={footerRows} flexDirection="column" backgroundColor={palette.bar} flexShrink={0}>
      <Box width={columns} height={1} backgroundColor={palette.bar} justifyContent="space-between" flexShrink={0}>
        <Text backgroundColor={palette.bar} wrap="truncate-end">
          <Text backgroundColor={palette.accent} color={palette.onAccent} bold>{` ${mode.toUpperCase()} `}</Text>
          {shown.map(([keys, action]) => (
            <Text key={keys + action}>
              <Text backgroundColor={palette.bar}> </Text>
              <Text backgroundColor={palette.neutralSoft} color={palette.text} bold>{` ${keys} `}</Text>
              <Text backgroundColor={palette.bar} color={palette.muted}>{` ${action}`}</Text>
            </Text>
          ))}
        </Text>
        <Box flexShrink={0}>
          {right ? (
            <Text backgroundColor={palette.bar} color={palette.faint}>
              {`${right} `}
            </Text>
          ) : null}
          {mouse ? (
            <Clickable onClick={mouse.onToggle} active={mouse.active}>
              <Text backgroundColor={palette.bar}>
                <Text backgroundColor={palette.neutralSoft} color={palette.text} bold>{' M '}</Text>
                <Text backgroundColor={palette.bar} color={mouse.on ? palette.muted : palette.warning}>{mouseLabel(mouse.on)}</Text>
              </Text>
            </Clickable>
          ) : null}
        </Box>
      </Box>
      <Box height={FOOTER_BRAND_GAP_ROWS} flexShrink={0} />
      <Box
        width={columns}
        height={footerRows - 1 - FOOTER_BRAND_GAP_ROWS}
        paddingX={1}
        backgroundColor={palette.bar}
        flexShrink={0}
        flexDirection={inlineBrand ? 'row' : 'column'}
        alignItems={inlineBrand ? 'center' : 'flex-start'}
        justifyContent="center"
      >
        <Logo cursorVisible />
        <Box width={sloganWidth} marginLeft={inlineBrand ? 2 : 0}>
          <Text backgroundColor={palette.bar} color={palette.muted} wrap="wrap">{APP_SLOGAN}</Text>
        </Box>
      </Box>
    </Box>
  );
}
