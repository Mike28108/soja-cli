import { Box, Text, useApp } from 'ink';
import { useMemo, useState } from 'react';
import { FileConfigStore } from '../../config/config.js';
import { CredentialStore } from '../../config/credentials.js';
import { resolvePaths } from '../../config/paths.js';
import { DEFAULT_SERVER_URL, isSecureServerUrl } from '../../config/server.js';
import { ApiClient } from '../../data/remote/api-client.js';
import { SojaError, ValidationError } from '../../domain/errors.js';
import type { User } from '../../domain/entities.js';
import { toDisplayError } from '../../utils/errors.js';
import { Splash } from '../branding/Splash.js';
import { Button } from '../kit/Button.js';
import { Panel } from '../kit/Panel.js';
import { Spinner } from '../kit/Spinner.js';
import { TextField } from '../components/TextField.js';
import { Layer } from '../input/dispatcher.js';
import { useKeys } from '../input/KeyProvider.js';
import { useTerminalSize } from '../hooks/use-terminal-size.js';
import { palette } from '../theme/theme.js';

type Country = { code: string; name: string; flag: string };
type LoginUser = User & { accessStatus: 'pending' | 'approved' | 'rejected'; isCeo: boolean };
type Stage = 'choose' | 'waiting' | 'profile' | 'workspace' | 'newworkspace' | 'error';
const sleep = (seconds: number) => new Promise((resolve) => setTimeout(resolve, seconds * 1000));

/** First-run choice between private local data and the GitHub-backed team service. */
export function WelcomeScreen({ onLocal }: { onLocal(): void }) {
  const { exit } = useApp();
  const { columns, rows } = useTerminalSize();
  const paths = resolvePaths();
  const config = useMemo(() => new FileConfigStore(paths.configFile), [paths.configFile]);
  const credentials = useMemo(() => new CredentialStore(paths.credentialsFile), [paths.credentialsFile]);
  const [stage, setStage] = useState<Stage>('choose');
  const server = config.load()?.remote?.apiUrl ?? DEFAULT_SERVER_URL;
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [device, setDevice] = useState<{ uri: string; code: string } | null>(null);
  const [user, setUser] = useState<LoginUser | null>(null);
  const [countries, setCountries] = useState<Country[]>([]);
  const [field, setField] = useState(0);
  const [values, setValues] = useState(['', '', '', '']);
  const [selectedCountry, setSelectedCountry] = useState<Country | null>(null);
  const [countryCursor, setCountryCursor] = useState(0);
  const [workspaceChoices, setWorkspaceChoices] = useState<{ id: string; name: string }[]>([]);
  const [workspaceName, setWorkspaceName] = useState('');
  const filtered = useMemo(() => countries.filter((country) => country.name.toLocaleLowerCase().includes((values[3] ?? '').toLocaleLowerCase())).slice(0, 10), [countries, values]);

  const chooseLocal = () => {
    const current = config.load();
    if (current?.mode === 'remote') config.save({ ...current, mode: 'local' });
    onLocal();
  };

  const signIn = async () => {
    setBusy(true); setError(''); setStage('waiting');
    try {
      const base = server.trim().replace(/\/$/, '');
      if (!isSecureServerUrl(base)) throw new ValidationError('El servidor SOJA debe usar HTTPS. Solo se permite HTTP en localhost durante el desarrollo.');
      const api = new ApiClient(base, null);
      const started = await api.post<{ deviceCode: string; userCode: string; verificationUri: string; interval: number; expiresIn: number }>('/v1/auth/device');
      setDevice({ uri: started.verificationUri, code: started.userCode });
      const deadline = Date.now() + started.expiresIn * 1000;
      let interval = started.interval;
      while (Date.now() < deadline) {
        await sleep(interval);
        const poll = await api.postWithStatus<{ status: string; token?: string; user?: LoginUser }>('/v1/auth/device/token', { deviceCode: started.deviceCode });
        if (poll.status === 202) { if (poll.body.status === 'slow_down') interval += 5; continue; }
        if (!poll.body.token || !poll.body.user) throw new SojaError('El backend no devolvió una sesión.');
        const accountApi = new ApiClient(base, poll.body.token);
        const account = await accountApi.get<{ user: LoginUser; workspaces: { id: string; name: string }[] }>('/v1/me');
        credentials.save(base, poll.body.token, poll.body.user.username);
        setUser(account.user);
        if (account.user.accessStatus === 'approved') {
          if (account.workspaces.length > 1) {
            setWorkspaceChoices(account.workspaces);
            config.save({ parentFolders: [], ...config.load(), mode: 'local', remote: { apiUrl: base, userId: account.user.id } });
            setStage('workspace'); setBusy(false); return;
          }
          if (account.workspaces.length === 0) {
            config.save({ parentFolders: [], ...config.load(), mode: 'local', remote: { apiUrl: base, userId: account.user.id } });
            setStage('newworkspace'); setBusy(false); return;
          }
          const workspaceId = account.workspaces[0]?.id;
          config.save({ parentFolders: [], ...config.load(), mode: 'remote', remote: { apiUrl: base, userId: account.user.id, ...(workspaceId ? { workspaceId } : {}) } });
          setMessage('Acceso aprobado. Abriendo SOJA Online…');
          setTimeout(() => exit(), 500);
          return;
        }
        if (account.user.accessStatus === 'rejected') {
          setMessage('La solicitud anterior fue rechazada. Puedes presentar una nueva.');
        }
        const countryResult = await accountApi.get<{ countries: Country[] }>('/v1/auth/countries');
        setCountries(countryResult.countries);
        setValues([account.user.displayName, '', '', '']);
        setStage('profile'); setBusy(false); return;
      }
      throw new SojaError('El código de GitHub expiró; vuelve a iniciar sesión.');
    } catch (failure) {
      setError(toDisplayError(failure).message); setStage('error'); setBusy(false);
    }
  };

  const selectWorkspace = (index: number) => {
    const workspace = workspaceChoices[index];
    if (!workspace || !user) return;
    const base = server.trim().replace(/\/$/, '');
    config.save({ parentFolders: [], ...config.load(), mode: 'remote', remote: { apiUrl: base, userId: user.id, workspaceId: workspace.id } });
    setMessage(`Workspace ${workspace.name} seleccionado. Abriendo SOJA Online…`);
    setTimeout(() => exit(), 500);
  };

  const createWorkspace = async () => {
    if (!user || !workspaceName.trim()) { setError('Escribe un nombre para tu workspace.'); return; }
    const base = server.trim().replace(/\/$/, '');
    const token = credentials.token(base);
    if (!token) { setError('No encontré la sesión guardada.'); return; }
    setBusy(true); setError('');
    try {
      const created = await new ApiClient(base, token).post<{ id: string }>('/v1/workspaces', { name: workspaceName.trim() });
      config.save({ parentFolders: [], ...config.load(), mode: 'remote', remote: { apiUrl: base, userId: user.id, workspaceId: created.id } });
      setTimeout(() => exit(), 400);
    } catch (failure) { setError(toDisplayError(failure).message); setBusy(false); }
  };

  const submitProfile = async () => {
    if (!user || !selectedCountry) { setError('Selecciona un país de la lista.'); return; }
    if (Array.from(values[2] ?? '').length > 100) { setError('La carta no puede superar 100 caracteres.'); return; }
    const base = server.trim().replace(/\/$/, '');
    const token = credentials.token(base);
    if (!token) { setError('No encontré la sesión guardada. Ejecuta `soja login`.'); return; }
    setBusy(true); setError('');
    try {
      await new ApiClient(base, token).post('/v1/access-request', { displayName: values[0], dateOfBirth: values[1], letter: values[2], countryCode: selectedCountry.code });
      const current = config.load();
      config.save({ parentFolders: [], ...current, mode: 'local', remote: { apiUrl: base, userId: user.id } });
      setMessage('Solicitud enviada. SOJA queda en modo local hasta que el CEO apruebe tu acceso.');
      setStage('error'); setBusy(false);
    } catch (failure) { setError(toDisplayError(failure).message); setBusy(false); }
  };

  useKeys(Layer.screen, (input, key) => {
    if (stage === 'choose') {
      if (input === '1' || input.toLowerCase() === 'l') { chooseLocal(); return true; }
      if (input === '2' || input.toLowerCase() === 'g') { void signIn(); return true; }
    }
    if (stage === 'error' && key.escape) { setStage('choose'); setError(''); setMessage(''); return true; }
    if (stage === 'workspace') {
      if (key.upArrow) { setCountryCursor((n) => Math.max(0, n - 1)); return true; }
      if (key.downArrow) { setCountryCursor((n) => Math.min(workspaceChoices.length - 1, n + 1)); return true; }
      if (key.return) { selectWorkspace(countryCursor); return true; }
      if (/^[1-9]$/.test(input)) { selectWorkspace(Number(input) - 1); return true; }
    }
    if (stage === 'newworkspace') {
      if (key.return) { void createWorkspace(); return true; }
      if (key.escape) { setStage('choose'); return true; }
    }
    if (stage === 'profile') {
      if (field === 3 && key.upArrow) { setCountryCursor((n) => Math.max(0, n - 1)); return true; }
      if (field === 3 && key.downArrow) { setCountryCursor((n) => Math.min(filtered.length - 1, n + 1)); return true; }
      if (field === 3 && key.return && filtered[countryCursor]) { setSelectedCountry(filtered[countryCursor] ?? null); setField(4); return true; }
      if (key.return) { if (field < 3) setField(field + 1); else if (field === 4) void submitProfile(); return true; }
      if (key.escape) { if (field > 0) setField(field - 1); else setStage('choose'); return true; }
    }
    return false;
  }, true);

  const width = Math.max(36, Math.min(76, columns - 4));
  return (
    <Box width={columns} height={rows} alignItems="center" justifyContent="center">
      <Box flexDirection="column" width={width}>
        <Box justifyContent="center"><Splash compact /></Box>
        {stage === 'choose' ? <Panel title="Welcome to SOJA" focused width={width}>
          <Text color={palette.text}>Choose how you want to work.</Text>
          <Box marginTop={1}><Button label="Sign in with GitHub" variant="primary" layer={Layer.screen} onPress={() => void signIn()} /></Box>
          <Box marginTop={1}><Button label="Local mode" layer={Layer.screen} onPress={chooseLocal} /></Box>
          <Box marginTop={1}><Text color={palette.muted}>Local mode keeps tasks on this machine and has no team chat.</Text></Box>
          <Box marginTop={1}><Text color={palette.faint}>g GitHub · l local · enter select</Text></Box>
        </Panel> : null}
        {stage === 'waiting' ? <Panel title="Sign in with GitHub" focused width={width}>
          {device ? <><Text>Open {device.uri}</Text><Text bold color={palette.accent}>Enter code: {device.code}</Text></> : <Text>Connecting to SOJA…</Text>}
          <Box marginTop={1}><Spinner label="Waiting for GitHub authorization…" /></Box>
        </Panel> : null}
        {stage === 'workspace' ? <Panel title="Choose a workspace" focused width={width}>
          <Text color={palette.muted}>Your account belongs to multiple workspaces.</Text>
          {workspaceChoices.map((workspace, index) => <Text key={workspace.id} color={index === countryCursor ? palette.accent : palette.text}>{`${index === countryCursor ? '›' : ' '} ${index + 1}. ${workspace.name}`}</Text>)}
          <Text color={palette.faint}>↑/↓ move · enter or 1–9 select</Text>
        </Panel> : null}
        {stage === 'newworkspace' ? <Panel title="Create your first workspace" focused width={width}>
          <Text color={palette.muted}>Your account is approved. Name the workspace you own.</Text>
          <TextField value={workspaceName} onChange={setWorkspaceName} placeholder="My team" width={width - 6} />
          {error ? <Text color={palette.danger}>{error}</Text> : null}
          <Text color={palette.faint}>enter create · esc back</Text>
        </Panel> : null}
        {stage === 'profile' ? <Panel title="Request SOJA access" aside={`${field + 1}/5`} focused width={width}>
          <Text color={palette.muted}>Your session is restricted until CEO approval.</Text>
          {field === 0 ? <><Text>Name</Text><TextField value={values[0] ?? ''} onChange={(v) => setValues((old) => [v, old[1] ?? '', old[2] ?? '', old[3] ?? ''])} placeholder="Full name" width={width - 6} /></> : null}
          {field === 1 ? <><Text>Date of birth (YYYY-MM-DD)</Text><TextField value={values[1] ?? ''} onChange={(v) => setValues((old) => [old[0] ?? '', v, old[2] ?? '', old[3] ?? ''])} placeholder="2000-01-31" width={width - 6} /></> : null}
          {field === 2 ? <><Text>Why are you interested in SOJA? (max 100 characters · {Array.from(values[2] ?? '').length}/100)</Text><TextField value={values[2] ?? ''} onChange={(v) => setValues((old) => [old[0] ?? '', old[1] ?? '', Array.from(v).slice(0, 100).join(''), old[3] ?? ''])} placeholder="I want to…" width={width - 6} /></> : null}
          {field === 3 ? <><Text>Country · type to search, ↑/↓ and enter to select</Text><TextField value={values[3] ?? ''} onChange={(v) => { setCountryCursor(0); setSelectedCountry(null); setValues((old) => [old[0] ?? '', old[1] ?? '', old[2] ?? '', v]); }} placeholder="Search countries" width={width - 6} />{filtered.map((country, index) => <Text key={country.code} color={index === countryCursor ? palette.accent : palette.muted}>{`${index === countryCursor ? '›' : ' '} ${country.flag} ${country.name}`}</Text>)}</> : null}
          {field === 4 ? <Text>Country selected: {selectedCountry?.flag} {selectedCountry?.name}</Text> : null}
          {error ? <Text color={palette.danger}>{error}</Text> : null}
          <Box marginTop={1}><Text color={palette.faint}>enter next · esc back {busy ? '· saving…' : ''}</Text></Box>
        </Panel> : null}
        {stage === 'error' ? <Panel title="SOJA account" focused width={width}>
          {error ? <Text color={palette.danger}>{error}</Text> : null}
          {message ? <Text color={palette.text}>{message}</Text> : null}
          <Box marginTop={1}><Button label="Back" layer={Layer.screen} onPress={() => { setStage('choose'); setError(''); setMessage(''); }} /></Box>
        </Panel> : null}
        {stage === 'profile' && error ? <Text color={palette.danger}>{error}</Text> : null}
      </Box>
    </Box>
  );
}
