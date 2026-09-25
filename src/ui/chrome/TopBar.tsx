import { Box, Text } from 'ink';
import { APP_NAME, APP_VERSION } from '../branding/brand.js';
import { palette, symbols } from '../theme/theme.js';

interface TopBarProps {
  columns: number;
  workspace: string;
  /** Where you are: `Projects`, `SOJA-12`… */
  trail: readonly string[];
  username: string;
  isCeo?: boolean;
  /** Remote mode: the server's host. */
  server?: string | undefined;
  sync?: { text: string; tone: 'ok' | 'busy' | 'warn' } | undefined;
  chat?: { unread: number; mentions: number } | undefined;
}

/** The title bar: brand and place on the left, connection and you on the right. */
export function TopBar({ columns, workspace, trail, username, isCeo, server, sync, chat }: TopBarProps) {
  const roomy = columns >= 90;
  const syncColor = sync?.tone === 'warn' ? palette.warning : sync?.tone === 'busy' ? palette.info : palette.muted;
  return (
    <Box width={columns} backgroundColor={palette.bar} justifyContent="space-between" flexShrink={0}>
      <Box flexShrink={1}>
        <Text wrap="truncate-end" backgroundColor={palette.bar}>
          <Text backgroundColor={palette.accent} color={palette.onAccent} bold>{` ${APP_NAME}${symbols.cursor} `}</Text>
          <Text color={palette.barText} bold>{`  ${workspace}`}</Text>
          {trail.map((part) => (
            <Text key={part} color={palette.muted}>{`  ${symbols.chevron} ${part}`}</Text>
          ))}
        </Text>
      </Box>
      <Box flexShrink={0} gap={2} paddingRight={1}>
        {chat && chat.unread > 0 ? (
          <Text backgroundColor={palette.bar}>
            <Text color={palette.accent}>{`${symbols.unread} ${chat.unread}`}</Text>
            {chat.mentions > 0 ? <Text color={palette.warning} bold>{` @${chat.mentions}`}</Text> : null}
          </Text>
        ) : null}
        {server ? (
          <Text backgroundColor={palette.bar} color={syncColor}>
            {`${symbols.link} ${roomy ? server : ''}${sync ? `${roomy ? ` ${symbols.dot} ` : ''}${sync.text}` : ''}`}
          </Text>
        ) : null}
        <Text backgroundColor={palette.bar} color={palette.barText}>{`@${username}`}{isCeo ? <Text color={palette.warning} bold>{' ★ CEO'}</Text> : null}</Text>
        {roomy ? <Text backgroundColor={palette.bar} color={palette.faint}>{`v${APP_VERSION}`}</Text> : null}
      </Box>
    </Box>
  );
}
