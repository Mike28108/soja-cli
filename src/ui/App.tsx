import { Box, Text, useApp } from 'ink';
import { useEffect, useState } from 'react';
import type { AppServices } from '../application/services/index.js';
import type { Session } from '../application/types.js';
import { toDisplayError, type DisplayError } from '../utils/errors.js';
import { AppStateProvider } from './app-state.js';
import { Splash } from './branding/Splash.js';
import { Layer } from './input/dispatcher.js';
import { KeyProvider, useKeys } from './input/KeyProvider.js';
import type { Route } from './navigation/routes.js';
import type { UpdateCheck } from '../application/services/update-service.js';
import { SetupScreen } from './screens/SetupScreen.js';
import { WelcomeScreen } from './screens/WelcomeScreen.js';
import { TerminalSizeProvider } from './hooks/use-terminal-size.js';
import { Shell } from './Shell.js';
import { palette, symbols } from './theme/theme.js';

type Phase =
  | { kind: 'splash' }
  | { kind: 'setup' }
  | { kind: 'ready'; session: Session }
  | { kind: 'failed'; error: DisplayError };

function resolvePhase(state: {
  stored: Session | null | undefined;
  created: Session | null;
  failure: DisplayError | null;
  splashDone: boolean;
}): Phase {
  if (state.failure) return { kind: 'failed', error: state.failure };
  // A session made by setup goes straight in; setup already showed the splash.
  if (state.created) return { kind: 'ready', session: state.created };
  if (state.stored === null) return { kind: 'setup' };
  if (state.stored && state.splashDone) return { kind: 'ready', session: state.stored };
  return { kind: 'splash' };
}

interface AppProps {
  services: AppServices;
  /** How long the launch splash stays at least. Any key skips it. */
  splashMs?: number;
  /** Working directory for Git features. */
  cwd?: string;
  /** Screen to open on top of home, e.g. the chat for `soja chat`. */
  initialRoute?: Route;
  /** Looks for a newer SOJA release (quietly; null when unknown). */
  updates?: () => Promise<UpdateCheck | null>;
  /** Clicks and the wheel (the real terminal turns it on; tests opt in). */
  mouse?: boolean;
}

export function App({ services, splashMs = 700, cwd = process.cwd(), initialRoute, updates, mouse = false }: AppProps) {
  return (
    <KeyProvider mouse={mouse}>
      <TerminalSizeProvider>
        <Boot services={services} splashMs={splashMs} cwd={cwd} initialRoute={initialRoute} updates={updates} />
      </TerminalSizeProvider>
    </KeyProvider>
  );
}

function Boot({ services, splashMs, cwd, initialRoute, updates }: Required<Omit<AppProps, 'initialRoute' | 'updates' | 'mouse'>> & Pick<AppProps, 'initialRoute' | 'updates'>) {
  const { exit } = useApp();
  // undefined while loading, null when setup is needed.
  const [stored, setStored] = useState<Session | null | undefined>(undefined);
  const [created, setCreated] = useState<Session | null>(null);
  const [localSetup, setLocalSetup] = useState(false);
  const [localChoiceDone, setLocalChoiceDone] = useState(false);
  const [failure, setFailure] = useState<DisplayError | null>(null);
  const [splashDone, setSplashDone] = useState(splashMs <= 0);

  useEffect(() => {
    services.session.current().then(setStored, (error: unknown) => setFailure(toDisplayError(error)));
  }, [services]);

  useEffect(() => {
    if (splashDone) return;
    const timer = setTimeout(() => setSplashDone(true), splashMs);
    return () => clearTimeout(timer);
  }, [splashDone, splashMs]);

  const phase = resolvePhase({ stored, created, failure, splashDone });

  useKeys(
    Layer.screen,
    (input) => {
      if (phase.kind === 'failed' && input === 'q') exit();
      else if (phase.kind === 'splash') setSplashDone(true);
      else return false;
      return true;
    },
    phase.kind === 'splash' || phase.kind === 'failed',
  );

  switch (phase.kind) {
    case 'splash':
      return <Splash />;
    case 'setup':
      return localSetup ? <SetupScreen services={services} onDone={setCreated} /> : <WelcomeScreen onLocal={() => { setLocalSetup(true); setLocalChoiceDone(true); }} />;
    case 'failed':
      if (services.environment.mode === 'remote') return <WelcomeScreen onLocal={() => exit()} />;
      return (
        <Box paddingX={1} paddingTop={1} flexDirection="column">
          <Text color={palette.danger}>{`${symbols.cross} ${phase.error.message}`}</Text>
          {phase.error.hint ? <Text dimColor>{phase.error.hint}</Text> : null}
          {phase.error.debug ? <Text dimColor>{phase.error.debug}</Text> : null}
          <Box marginTop={1}>
            <Text dimColor>q quit</Text>
          </Box>
        </Box>
      );
    case 'ready':
      if (services.environment.mode === 'local' && !localChoiceDone) return <WelcomeScreen onLocal={() => setLocalChoiceDone(true)} />;
      return (
        <AppStateProvider services={services} cwd={cwd} initialSession={phase.session} {...(initialRoute ? { initialRoute } : {})} {...(updates ? { updates } : {})}>
          <Shell />
        </AppStateProvider>
      );
  }
}
