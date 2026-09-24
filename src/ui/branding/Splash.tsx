import { Box, Text, useAnimation, useWindowSize } from 'ink';
import { APP_AUTHOR, APP_DESCRIPTION, APP_SLOGAN, WORDMARK_WIDTH } from './brand.js';
import { CompactLogo } from './CompactLogo.js';
import { Logo } from './Logo.js';
import { VersionBadge } from './VersionBadge.js';

/** Big identity for launch and first-run setup. About nine rows tall. */
export function Splash({ status }: { status?: string }) {
  const { columns } = useWindowSize();
  const { frame } = useAnimation({ interval: 530 });
  const roomy = columns >= WORDMARK_WIDTH + 4;

  return (
    <Box flexDirection="column" paddingTop={1}>
      {roomy ? <Logo cursorVisible={frame % 2 === 0} /> : <CompactLogo />}
      <Box marginTop={1} flexDirection="column">
        <Text bold>{APP_DESCRIPTION}</Text>
        <Text dimColor>{APP_SLOGAN}</Text>
      </Box>
      <Box marginTop={1} gap={2}>
        <Text dimColor>{APP_AUTHOR}</Text>
        <VersionBadge />
        {status ? <Text dimColor>{status}</Text> : null}
      </Box>
    </Box>
  );
}
