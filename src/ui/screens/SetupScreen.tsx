import { Box, Text } from 'ink';
import { useState } from 'react';
import type { AppServices } from '../../application/services/index.js';
import type { Session } from '../../application/types.js';
import { slugify } from '../../domain/naming.js';
import { toDisplayError } from '../../utils/errors.js';
import { Splash } from '../branding/Splash.js';
import { TextField } from '../components/TextField.js';
import { useTerminalSize } from '../hooks/use-terminal-size.js';
import { Button } from '../kit/Button.js';
import { Gauge } from '../kit/Gauge.js';
import { Panel } from '../kit/Panel.js';
import { Spinner } from '../kit/Spinner.js';
import { Layer } from '../input/dispatcher.js';
import { useKeys } from '../input/KeyProvider.js';
import { palette, symbols } from '../theme/theme.js';

type Step = 'displayName' | 'username' | 'workspaceName';
const STEPS: Step[] = ['displayName', 'username', 'workspaceName'];
const QUESTIONS: Record<Step, string> = {
  displayName: "What's your name?",
  username: 'Username',
  workspaceName: 'Workspace name',
};
const PLACEHOLDERS: Record<Step, string> = {
  displayName: 'Michael',
  username: 'michael',
  workspaceName: 'Bravos Development',
};

/** First run: three questions, then straight into SOJA. */
export function SetupScreen({ services, onDone }: { services: AppServices; onDone(session: Session): void }) {
  const [step, setStep] = useState(0);
  const [values, setValues] = useState<Record<Step, string>>({ displayName: '', username: '', workspaceName: '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const current = STEPS[step] ?? 'displayName';

  const advance = async () => {
    if (busy) return;
    if (!values[current].trim()) {
      setError('This one is required.');
      return;
    }
    setError(null);
    if (current === 'displayName' && !values.username) {
      // Suggest a username from the name; it stays editable.
      setValues((previous) => ({ ...previous, username: slugify(previous.displayName).replace(/-/g, '') }));
    }
    if (step < STEPS.length - 1) {
      setStep(step + 1);
      return;
    }
    setBusy(true);
    try {
      onDone(await services.session.setup(values));
    } catch (failure) {
      setError(toDisplayError(failure).message);
      setBusy(false);
    }
  };

  useKeys(Layer.screen, (_input, key) => {
    if (key.return) void advance();
    else if (key.escape && step > 0) {
      setError(null);
      setStep(step - 1);
    } else return false;
    return true;
  });

  const { columns, rows } = useTerminalSize();
  const width = Math.min(76, columns - 4);
  const stepTitles: Record<Step, string> = { displayName: 'Your name', username: 'Username', workspaceName: 'Workspace' };
  const helpers: Record<Step, string> = {
    displayName: 'How your teammates see you in SOJA.',
    username: 'Used in @mentions and assignments. Letters, numbers and dashes.',
    workspaceName: 'Your team or company. You can create more later.',
  };
  return (
    <Box width={columns} height={rows} alignItems="center" justifyContent="center">
      <Box flexDirection="column" width={width}>
        <Box justifyContent="center">
          <Splash compact />
        </Box>
        <Panel title="First setup" aside={`step ${step + 1} of ${STEPS.length}`} focused width={width}>
          <Box gap={1} marginBottom={1}>
            {STEPS.map((name, index) => (
              <Box key={name} gap={1}>
                {index > 0 ? <Text color={index <= step ? palette.accent : palette.border}>{'──'}</Text> : null}
                <Text
                  {...(index === step ? { backgroundColor: palette.accent, color: palette.onAccent, bold: true } : { color: index < step ? palette.success : palette.faint })}
                >
                  {` ${index < step ? symbols.check : String(index + 1)} ${stepTitles[name]} `}
                </Text>
              </Box>
            ))}
          </Box>
          <Text color={palette.text} bold>
            {QUESTIONS[current]}
          </Text>
          <Text color={palette.muted}>{helpers[current]}</Text>
          <Box marginTop={1}>
            <TextField
              value={values[current]}
              onChange={(value) => setValues((previous) => ({ ...previous, [current]: value }))}
              placeholder={PLACEHOLDERS[current]}
              width={width - 6}
            />
          </Box>
          <Box marginTop={1} flexDirection="column">
            {STEPS.slice(0, step).map((name) => (
              <Text key={name} color={palette.muted}>{`${symbols.check} ${stepTitles[name]}: ${values[name]}`}</Text>
            ))}
          </Box>
          <Box marginTop={1} justifyContent="space-between">
            {error ? (
              <Text color={palette.danger}>{`${symbols.cross} ${error}`}</Text>
            ) : busy ? (
              <Spinner label="Setting things up…" />
            ) : (
              <Gauge value={step} total={STEPS.length} width={16} />
            )}
            <Box gap={2}>
              {step > 0 ? <Button label="Back" layer={Layer.screen} onPress={() => { setError(null); setStep(step - 1); }} /> : null}
              <Button label={step === STEPS.length - 1 ? 'Finish' : `Next ${symbols.arrow}`} variant="primary" layer={Layer.screen} onPress={() => void advance()} />
            </Box>
          </Box>
        </Panel>
        <Box justifyContent="center" marginTop={1}>
          <Text color={palette.faint}>Everything stays on this machine · enter next · esc back · ctrl+c quit</Text>
        </Box>
      </Box>
    </Box>
  );
}
