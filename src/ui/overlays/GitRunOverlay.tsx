import { Box, Text, useAnimation, useApp } from 'ink';
import { useEffect, useRef, useState } from 'react';
import type { ConsoleLine } from '../../git/console.js';
import { GitError } from '../../git/types.js';
import { toDisplayError } from '../../utils/errors.js';
import { useAppState } from '../app-state.js';
import type { Hint } from '../components/Footer.js';
import { ConsoleLines } from '../components/ConsoleLines.js';
import { Layer } from '../input/dispatcher.js';
import { useKeys } from '../input/KeyProvider.js';
import { palette, symbols } from '../theme/theme.js';
import { OverlayFrame, useOverlayHeight } from './OverlayFrame.js';
import type { GitAction, GitRunSpec } from './types.js';

type Outcome =
  | { phase: 'running' }
  | { phase: 'done'; message: string }
  | { phase: 'failed'; message: string; suggestions: readonly string[]; code: GitError['code'] | null };

const SPINNER = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export function GitRunOverlay({ spec }: { spec: GitRunSpec }) {
  const { services, closeOverlay, refresh } = useAppState();
  const { suspendTerminal } = useApp();
  const { frame } = useAnimation({ interval: 80 });
  const [startId] = useState(() => services.gitConsole.lastId);
  const [lines, setLines] = useState<ConsoleLine[]>([]);
  const [outcome, setOutcome] = useState<Outcome>({ phase: 'running' });
  const started = useRef(false);
  const height = useOverlayHeight();

  useEffect(
    () => services.gitConsole.subscribe(() => setLines(services.gitConsole.since(startId))),
    [services.gitConsole, startId],
  );

  const execute = async (mode: 'normal' | 'interactive' | 'login') => {
    try {
      let message = '';
      if (mode === 'normal') {
        message = await spec.run(false);
      } else {
        // Hand the terminal to Git/gh so they can ask for credentials, then come back.
        await suspendTerminal(async () => {
          process.stdout.write(`\nSOJA is paused. ${mode === 'login' ? 'Log in to GitHub below.' : 'Git may ask for your credentials.'}\n\n`);
          if (mode === 'login') await services.git.loginGitHub();
          message = mode === 'login' ? await spec.run(false) : await spec.run(true);
        });
      }
      services.gitConsole.write('success', message);
      setOutcome({ phase: 'done', message });
    } catch (error) {
      const display = toDisplayError(error);
      setOutcome({
        phase: 'failed',
        message: display.message,
        suggestions: error instanceof GitError ? error.suggestions : display.hint ? [display.hint] : [],
        code: error instanceof GitError ? error.code : null,
      });
    } finally {
      refresh();
    }
  };

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void execute('normal');
    // Runs once when the overlay opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const retry = (mode: 'normal' | 'interactive' | 'login') => {
    setOutcome({ phase: 'running' });
    void execute(mode);
  };

  const recovery: GitAction[] = [];
  if (outcome.phase === 'failed') {
    if (outcome.code === 'auth_required') recovery.push({ key: 'i', label: 'retry with credentials', action: () => retry('interactive') });
    if (outcome.code === 'gh_auth') recovery.push({ key: 'i', label: 'gh auth login and retry', action: () => retry('login') });
    const custom = outcome.code ? spec.recover?.[outcome.code] : undefined;
    if (custom) recovery.push(custom);
    recovery.push({ key: 'r', label: 'retry', action: () => retry('normal') });
  }
  const actions = outcome.phase === 'done' ? (spec.next ?? []) : recovery;

  useKeys(Layer.overlay, (input, key) => {
    if (outcome.phase === 'running') return true;
    if (key.escape || key.return) closeOverlay(spec);
    else actions.find((action) => action.key === input)?.action();
    return true;
  });

  const suggestions = outcome.phase === 'failed' ? outcome.suggestions : [];
  // The success line is shown below; the console keeps it for the Git log.
  const visible = lines.filter((line) => line.kind !== 'success').slice(-Math.max(3, height - 3 - suggestions.length));
  const hints: Hint[] =
    outcome.phase === 'running'
      ? [['', 'running…']]
      : [...actions.map((action): Hint => [action.key, action.label]), ['esc', 'close']];

  return (
    <OverlayFrame title={spec.title} context={spec.context} hints={hints}>
      <ConsoleLines lines={visible} />
      <Box marginTop={1} flexDirection="column">
        {outcome.phase === 'running' ? (
          <Text color={palette.accent}>{`${SPINNER[frame % SPINNER.length]} Working…`}</Text>
        ) : outcome.phase === 'done' ? (
          <Text color={palette.success}>{`${symbols.check} ${outcome.message}`}</Text>
        ) : (
          <>
            <Text color={palette.danger}>{`${symbols.cross} ${outcome.message}`}</Text>
            {suggestions.map((suggestion) => (
              <Text key={suggestion} dimColor wrap="truncate-end">{`  ${symbols.arrow} ${suggestion}`}</Text>
            ))}
          </>
        )}
      </Box>
    </OverlayFrame>
  );
}
