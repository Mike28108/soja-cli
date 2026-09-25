import { Box, Text, useAnimation } from 'ink';
import { useTerminalSize } from '../hooks/use-terminal-size.js';
import { Spinner } from '../kit/Spinner.js';
import { palette } from '../theme/theme.js';
import { APP_AUTHOR, APP_DESCRIPTION, APP_SLOGAN, APP_VERSION, WORDMARK_WIDTH } from './brand.js';
import { CompactLogo } from './CompactLogo.js';
import { Logo } from './Logo.js';

/**
 * SOJA's identity. Full screen and centered at launch; `compact` is the
 * block the setup wizard puts above its card.
 */
export function Splash({ status, compact = false }: { status?: string; compact?: boolean }) {
  const { columns, rows } = useTerminalSize();
  const { frame } = useAnimation({ interval: 530 });
  const roomy = columns >= WORDMARK_WIDTH + 4;

  const identity = (
    <Box flexDirection="column" alignItems="center" paddingBottom={1}>
      {roomy ? <Logo cursorVisible={frame % 2 === 0} /> : <CompactLogo />}
      <Box marginTop={1} flexDirection="column" alignItems="center">
        <Text color={palette.text} bold>
          {APP_DESCRIPTION}
        </Text>
        <Text color={palette.muted}>{APP_SLOGAN}</Text>
      </Box>
    </Box>
  );
  if (compact) return identity;
  return (
    <Box width={columns} height={rows} flexDirection="column" alignItems="center" justifyContent="center">
      {identity}
      <Box marginTop={1}>
        <Spinner label={status ?? 'Opening your workspace…'} />
      </Box>
      <Box marginTop={1} gap={2}>
        <Text color={palette.faint}>{APP_AUTHOR}</Text>
        <Text color={palette.faint}>{`v${APP_VERSION}`}</Text>
      </Box>
    </Box>
  );
}
