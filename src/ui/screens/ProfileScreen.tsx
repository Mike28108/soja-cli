import { Box, Text } from 'ink';
import { useMemo } from 'react';
import { CredentialStore } from '../../config/credentials.js';
import { resolvePaths } from '../../config/paths.js';
import { ApiClient } from '../../data/remote/api-client.js';
import { useAppState } from '../app-state.js';
import { EmptyState } from '../components/EmptyState.js';
import { useQuery } from '../hooks/use-query.js';
import { Layer } from '../input/dispatcher.js';
import { useKeys } from '../input/KeyProvider.js';
import { Panel } from '../kit/Panel.js';
import { ScreenFrame } from './ScreenFrame.js';
import { palette, symbols } from '../theme/theme.js';
import { toDisplayError } from '../../utils/errors.js';

interface Profile {
  id: string;
  username: string;
  displayName: string;
  email: string | null;
  dateOfBirth: string | null;
  countryCode: string | null;
  isCeo: boolean;
  accessStatus: 'pending' | 'approved' | 'rejected';
}

interface Country { code: string; name: string; flag: string }

export function ProfileScreen({ active }: { active: boolean }) {
  const { services, session, openOverlay, run, invalidateQueries, notify } = useAppState();
  const client = useMemo(() => {
    if (services.environment.mode !== 'remote') return null;
    const token = new CredentialStore(resolvePaths().credentialsFile).token(services.environment.server);
    return token ? new ApiClient(services.environment.server, token) : null;
  }, [services.environment]);
  const topic = `profile:${session.user.id}`;
  const query = useQuery(() => client
    ? client.get<{ user: Profile }>('/v1/profile').then((result) => result.user)
    : Promise.reject(new Error('Your SOJA profile is available while signed in online.')), topic, [topic]);
  const profile = query.data;

  const save = (changes: Partial<Pick<Profile, 'displayName' | 'dateOfBirth' | 'countryCode'>>) => {
    if (!client || !profile) return false;
    if (!profile.dateOfBirth || !profile.countryCode) {
      openOverlay({ kind: 'prompt', title: 'Complete profile · date of birth (YYYY-MM-DD)', initial: profile.dateOfBirth ?? '', onSubmit: (dateOfBirth) => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth)) return false;
        return run(async () => {
          await client.request('PUT', '/v1/profile', { displayName: profile.displayName, dateOfBirth, countryCode: profile.countryCode ?? '' });
          invalidateQueries([topic]);
        }, 'Profile updated');
      } });
      return false;
    }
    return run(async () => {
      await client.request('PUT', '/v1/profile', { displayName: changes.displayName ?? profile.displayName, dateOfBirth: changes.dateOfBirth ?? profile.dateOfBirth, countryCode: changes.countryCode ?? profile.countryCode });
      invalidateQueries([topic]);
    }, 'Profile updated');
  };

  useKeys(Layer.screen, (input) => {
    if (!profile || !client) return false;
    if (input === 'n') {
      openOverlay({ kind: 'prompt', title: 'Display name', initial: profile.displayName, placeholder: 'Your name', onSubmit: (displayName) => {
        const cleaned = displayName.trim();
        if (!cleaned || cleaned.length > 80) return false;
        return save({ displayName: cleaned });
      } });
      return true;
    }
    if (input === 'd') {
      openOverlay({ kind: 'prompt', title: 'Date of birth (YYYY-MM-DD)', initial: profile.dateOfBirth ?? '', placeholder: '1990-01-31', onSubmit: (dateOfBirth) => save({ dateOfBirth }) });
      return true;
    }
    if (input === 'c') {
      void client.get<{ countries: Country[] }>('/v1/auth/countries').then(({ countries }) => {
        openOverlay({ kind: 'picker', title: 'Country', initial: profile.countryCode, filterable: true, options: countries.map((country) => ({ value: country.code, label: `${country.flag} ${country.name} · ${country.code}` })), onSelect: (countryCode) => save({ countryCode }) });
      }).catch((error: unknown) => notify(toDisplayError(error).message, 'error'));
      return true;
    }
    return false;
  }, active);

  if (services.environment.mode !== 'remote') return <ScreenFrame title="Profile" hints={[[ 'esc', 'back' ]]}><EmptyState lines={['Sign in to view your online profile.']} icon={symbols.dot} /></ScreenFrame>;
  if (query.error && !profile) return <ScreenFrame title="Profile" hints={[[ 'esc', 'back' ]]}><EmptyState lines={[query.error.message, query.error.hint ?? '']} icon={symbols.cross} /></ScreenFrame>;
  if (!profile) return <ScreenFrame title="Profile" hints={[[ 'esc', 'back' ]] }><Text color={palette.faint}>Loading profile…</Text></ScreenFrame>;

  return (
    <ScreenFrame title="My profile" aside={`@${profile.username}`} hints={[[ 'n', 'name' ], [ 'd', 'birth date' ], [ 'c', 'country' ], [ 'esc', 'back' ]] }>
      <Box flexDirection="column" gap={1}>
        <Panel title="SOJA account" height={7}>
          <Text color={palette.text}>Username · @{profile.username}</Text>
          <Text color={palette.text}>Display name · {profile.displayName}</Text>
          <Text color={palette.text}>Country · {profile.countryCode ?? 'not set'}</Text>
          <Text color={palette.text}>Date of birth · {profile.dateOfBirth ?? 'not set'}</Text>
          <Text color={palette.faint}>Access · {profile.accessStatus}{profile.isCeo ? ' · ★ CEO' : ''}</Text>
        </Panel>
        <Text color={palette.faint}>Personal profile details are visible only to you here. Change them with n, d or c.</Text>
      </Box>
    </ScreenFrame>
  );
}
