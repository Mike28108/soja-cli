import { Box, Text } from 'ink';
import { symbols } from '../theme/theme.js';
import { CompactLogo } from './CompactLogo.js';
import { VersionBadge } from './VersionBadge.js';

interface HeaderProps {
  workspace: string;
  /** Where you are inside the workspace, e.g. a project name. */
  context?: string | undefined;
  username: string;
  width: number;
}

/** The discreet line that stays on top during normal use. */
export function Header({ workspace, context, username, width }: HeaderProps) {
  const roomy = width >= 60;
  return (
    <Box justifyContent="space-between" width={width}>
      <Box gap={2} flexShrink={1}>
        <CompactLogo />
        <Text wrap="truncate-end">
          <Text>{workspace}</Text>
          {context ? <Text dimColor>{` / ${context}`}</Text> : null}
        </Text>
      </Box>
      <Box gap={2} flexShrink={0}>
        <Text dimColor>@{username}</Text>
        {roomy ? <VersionBadge /> : null}
      </Box>
    </Box>
  );
}

export function Rule({ width }: { width: number }) {
  return <Text dimColor>{symbols.rule.repeat(Math.max(0, width))}</Text>;
}
