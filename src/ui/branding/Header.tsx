import { Box, Text } from 'ink';
import { palette, symbols } from '../theme/theme.js';
import { CompactLogo } from './CompactLogo.js';
import { VersionBadge } from './VersionBadge.js';

interface HeaderProps {
  workspace: string;
  /** Where you are inside the workspace, e.g. a project name. */
  context?: string | undefined;
  username: string;
  width: number;
  /** Host of the SOJA server in remote mode. */
  server?: string | undefined;
  /** Remote mode sync state, e.g. "2 pending" or "offline". */
  syncLabel?: { text: string; warn: boolean } | undefined;
  /** Remote mode chat: unread messages and mentions of you. */
  chat?: { unread: number; mentions: number } | undefined;
}

/** The discreet line that stays on top during normal use. */
export function Header({ workspace, context, username, width, server, syncLabel, chat }: HeaderProps) {
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
        {server ? (
          <Text>
            <Text dimColor>{`⇄ ${server}`}</Text>
            {syncLabel ? (
              <Text color={syncLabel.warn ? palette.warning : undefined} dimColor={!syncLabel.warn}>{` · ${syncLabel.text}`}</Text>
            ) : null}
          </Text>
        ) : null}
        {chat && chat.unread > 0 ? (
          <Text>
            <Text color={palette.accent}>{`${symbols.unread} ${chat.unread}`}</Text>
            {chat.mentions > 0 ? <Text color={palette.warning}>{` ${symbols.dot} @${chat.mentions}`}</Text> : null}
          </Text>
        ) : null}
        <Text dimColor>@{username}</Text>
        {roomy ? <VersionBadge /> : null}
      </Box>
    </Box>
  );
}

export function Rule({ width }: { width: number }) {
  return <Text dimColor>{symbols.rule.repeat(Math.max(0, width))}</Text>;
}
