import { Box, Text } from 'ink';
import { useCallback, useEffect, useState } from 'react';
import { FileConfigStore } from '../../config/config.js';
import { CredentialStore } from '../../config/credentials.js';
import { resolvePaths } from '../../config/paths.js';
import { ApiClient } from '../../data/remote/api-client.js';
import { toDisplayError } from '../../utils/errors.js';
import { useLayout } from '../hooks/use-layout.js';
import { Layer } from '../input/dispatcher.js';
import { useKeys } from '../input/KeyProvider.js';
import { Badge } from '../kit/Badge.js';
import { Clickable } from '../kit/Clickable.js';
import { Panel } from '../kit/Panel.js';
import { palette, symbols } from '../theme/theme.js';
import { ScreenFrame } from './ScreenFrame.js';

interface Request { id: string; username: string; githubId: number; displayName: string; dateOfBirth: string | null; countryCode: string | null; letter: string; submittedAt: string }

export function AccessScreen({ active }: { active: boolean }) {
  const { height, width } = useLayout();
  const [requests, setRequests] = useState<Request[]>([]);
  const [index, setIndex] = useState(0);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const api = useCallback(() => {
    const remote = new FileConfigStore(resolvePaths().configFile).load()?.remote;
    const token = remote ? new CredentialStore(resolvePaths().credentialsFile).token(remote.apiUrl) : null;
    return remote && token ? new ApiClient(remote.apiUrl, token) : null;
  }, []);
  const refresh = useCallback(async () => {
    const client = api();
    if (!client) { setError('La revisión de solicitudes requiere una sesión remota.'); return; }
    try { setRequests((await client.get<{ requests: Request[] }>('/v1/admin/access-requests')).requests); setError(''); }
    catch (failure) { setError(toDisplayError(failure).message); }
  }, [api]);
  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(() => void refresh(), 0);
    return () => clearTimeout(timer);
  }, [active, refresh]);

  const decide = async (decision: 'approve' | 'reject') => {
    const request = requests[index];
    const client = api();
    if (!request || !client || busy) return;
    setBusy(true);
    try { await client.post(`/v1/admin/access-requests/${request.id}/${decision}`); await refresh(); setIndex(Math.min(index, Math.max(0, requests.length - 2))); }
    catch (failure) { setError(toDisplayError(failure).message); }
    finally { setBusy(false); }
  };

  useKeys(Layer.screen, (input, key) => {
    if (key.upArrow || input === 'k') { setIndex((n) => Math.max(0, n - 1)); return true; }
    if (key.downArrow || input === 'j') { setIndex((n) => Math.min(requests.length - 1, n + 1)); return true; }
    if (input === 'y') { void decide('approve'); return true; }
    if (input === 'n') { void decide('reject'); return true; }
    if (input === 'r') { void refresh(); return true; }
    return false;
  }, active);

  const request = requests[index];
  return <ScreenFrame title="Access approvals" aside={`${requests.length} pending`} hints={[[`↑↓`, 'select'], ['y', 'approve'], ['n', 'reject'], ['r', 'refresh'], ['esc', 'back']]}>
    <Box flexDirection="row" gap={1} height={Math.max(5, height - 3)}>
      <Panel title="Pending requests" width={Math.max(28, Math.floor(width * 0.42))}>
        {requests.length ? requests.map((item, position) => <Clickable key={item.id} active={active} onClick={() => setIndex(position)}><Box backgroundColor={position === index ? palette.selection : undefined} gap={1}><Text color={palette.accent}>{position === index ? symbols.pointer : ' '}</Text><Text color={palette.text}>{`@${item.username}`}</Text><Badge tone="warning">pending</Badge></Box></Clickable>) : <Text color={palette.muted}>{error ? 'Could not load requests.' : 'No pending requests.'}</Text>}
        {busy ? <Text color={palette.muted}>Saving decision…</Text> : null}
      </Panel>
      <Panel title={request ? request.displayName : 'Request details'} flexGrow={1}>
        {error ? <Text color={palette.danger}>{error}</Text> : null}
        {request ? <>
          <Text color={palette.muted}>{`@${request.username} · GitHub ID ${request.githubId} · ${request.countryCode ?? 'country missing'}`}</Text>
          <Text color={palette.muted}>{`Date of birth: ${request.dateOfBirth ?? 'not provided'} · ${request.submittedAt}`}</Text>
          <Box marginTop={1}><Text color={palette.text} bold>Interest letter</Text></Box>
          <Text color={palette.text} wrap="wrap">{request.letter}</Text>
          <Box marginTop={1} gap={2}><Text color={palette.success}>y approve</Text><Text color={palette.danger}>n reject</Text></Box>
        </> : null}
      </Panel>
    </Box>
  </ScreenFrame>;
}
