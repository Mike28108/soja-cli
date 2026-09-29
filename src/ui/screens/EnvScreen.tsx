import { Box, Text } from 'ink';
import { hostname } from 'node:os';
import { useState } from 'react';
import { ENV_ENVIRONMENTS, GRANT_DAYS, type EnvEnvironment, type EnvOperations, type EnvVaultView } from '../../application/env.js';
import { formatRelative } from '../../utils/time.js';
import { useAppState } from '../app-state.js';
import { useLayout } from '../hooks/use-layout.js';
import { useQuery } from '../hooks/use-query.js';
import { Layer } from '../input/dispatcher.js';
import { useKeys } from '../input/KeyProvider.js';
import { Badge } from '../kit/Badge.js';
import { Clickable } from '../kit/Clickable.js';
import { Panel } from '../kit/Panel.js';
import { palette, symbols } from '../theme/theme.js';
import { ScreenFrame } from './ScreenFrame.js';

const LABEL: Record<EnvEnvironment, string> = { development: 'Development', staging: 'Staging', production: 'Production' };

/**
 * The shared, end-to-end encrypted variables of one project, per environment.
 * Values are never shown: owners type them (masked), everyone uses them
 * through `soja run` while SOJA is open.
 */
export function EnvScreen({ active, projectId }: { active: boolean; projectId: string }) {
  const { services, session } = useAppState();
  const env = services.env;
  if (!env) {
    return (
      <ScreenFrame title="Environment variables" hints={[['esc', 'back']]}>
        <Text color={palette.muted}>Shared variables need remote mode: sign in with `soja login`.</Text>
      </ScreenFrame>
    );
  }
  return <EnvPanels active={active} projectId={projectId} env={env} sessionKey={session.workspace.id} />;
}

function EnvPanels({ active, projectId, env, sessionKey }: { active: boolean; projectId: string; env: EnvOperations; sessionKey: string }) {
  const { services, session, openOverlay, run, notify } = useAppState();
  const { width, height } = useLayout();
  const [index, setIndex] = useState(0);
  const device = env.thisDevice();
  const project = useQuery(async () => (await services.projects.list(session)).find((entry) => entry.id === projectId) ?? null, `env-project:${projectId}`);
  const role = useQuery(async () => (await services.workspaces.members(session)).find((member) => member.id === session.user.id)?.role ?? 'member', `env-role:${sessionKey}`);
  const vaults = useQuery(async () => (device ? await env.vaults(session, projectId) : []), `env-vaults:${projectId}`);
  const environment = ENV_ENVIRONMENTS[index] ?? 'development';
  const vault = vaults.data?.find((entry) => entry.environment === environment) ?? null;
  const owner = role.data === 'owner';
  const projectName = project.data?.name ?? 'Project';

  const setup = () =>
    openOverlay({
      kind: 'prompt',
      title: 'Set up this machine',
      context: 'Its keys are created here; the private ones never leave it.',
      initial: hostname(),
      onSubmit: (label) => run(async () => {
        const created = await env.setup(label);
        notify(`This machine is ${created.label}`, 'success', `Fingerprint ${created.fingerprint}`);
      }),
    });

  const addVariable = (target: EnvVaultView) =>
    openOverlay({
      kind: 'prompt',
      title: `New or changed variable · ${LABEL[target.environment]}`,
      context: 'UPPER_SNAKE_CASE, e.g. DATABASE_URL',
      suggestions: target.names.map((entry) => entry.name),
      onSubmit: (raw) => {
        const name = raw.trim().toUpperCase();
        if (!/^[A-Z_][A-Z0-9_]{0,127}$/.test(name)) {
          notify('Use UPPER_SNAKE_CASE: letters, digits and _.', 'error');
          return false;
        }
        openOverlay({
          kind: 'prompt',
          title: `${name} · ${projectName} ${target.environment}`,
          context: 'The value is encrypted on this machine before it is sent.',
          secret: true,
          allowEmpty: true,
          onSubmit: (value) => run(() => env.setVariable(session, target.id, name, value), `${name} saved`),
        });
      },
    });

  const removeVariable = (target: EnvVaultView) =>
    openOverlay({
      kind: 'picker',
      title: `Remove a variable · ${LABEL[target.environment]}`,
      options: target.names.map((entry) => ({ value: entry.name, label: entry.name, tone: 'danger' as const })),
      filterable: true,
      onSelect: (name) =>
        openOverlay({
          kind: 'confirm',
          title: `Remove ${name}?`,
          message: `Programs started with \`soja run\` will no longer receive it in ${target.environment}.`,
          confirmLabel: 'Remove',
          tone: 'danger',
          onConfirm: () => run(() => env.removeVariable(session, target.id, name), `${name} removed`),
        }),
    });

  const grant = async (target: EnvVaultView) => {
    const members = (await services.workspaces.members(session)).filter((member) => member.role !== 'owner' && member.id !== session.user.id);
    if (!members.length) return notify('Nobody to share with: add developers to the workspace first.', 'info');
    openOverlay({
      kind: 'picker',
      title: `Give access · ${projectName} ${target.environment}`,
      options: members.map((member) => {
        const current = target.grants.find((entry) => entry.userId === member.id);
        return { value: member.id, label: `@${member.username}`, ...(current ? { hint: `until ${current.expiresAt.toLocaleDateString()}` } : {}) };
      }),
      filterable: true,
      onSelect: (userId) =>
        openOverlay({
          kind: 'picker',
          title: 'For how long?',
          context: 'Access ends by itself; programs using it are stopped.',
          options: GRANT_DAYS.map((days) => ({ value: String(days), label: `${days} days` })),
          initial: '7',
          onSelect: (days) =>
            run(async () => {
              const result = await env.grant(session, target.id, userId, Number(days) as (typeof GRANT_DAYS)[number]);
              const waiting = result.waitingFor.length ? ` · ${result.waitingFor.length} device(s) need confirming (t)` : '';
              notify(`Access until ${result.expiresAt.toLocaleString()}${waiting}`, 'success');
            }),
        }),
    });
  };

  const revoke = (target: EnvVaultView) => {
    if (!target.grants.length) return notify('Nobody has temporary access here.', 'info');
    openOverlay({
      kind: 'picker',
      title: `Take access back · ${target.environment}`,
      options: target.grants.map((entry) => ({ value: entry.userId, label: `@${entry.username}`, hint: `until ${entry.expiresAt.toLocaleDateString()}`, tone: 'danger' as const })),
      onSelect: (userId) => {
        const who = target.grants.find((entry) => entry.userId === userId)?.username ?? 'them';
        openOverlay({
          kind: 'confirm',
          title: `Revoke @${who}?`,
          message: 'Their programs stop, the key is rotated, and you should change at the provider every value they saw.',
          confirmLabel: 'Revoke and rotate',
          tone: 'danger',
          onConfirm: () =>
            run(async () => {
              const seen = target.names.map((entry) => entry.name);
              await env.revoke(session, target.id, userId);
              const rotated = await env.rotate(session, target.id);
              notify(`@${who} revoked · key v${rotated.keyVersion}`, 'success', seen.length ? `Change at the provider: ${seen.join(', ')}` : undefined);
            }),
        });
      },
    });
  };

  const devices = async () => {
    const list = await env.devices(session);
    openOverlay({
      kind: 'picker',
      title: 'Devices and fingerprints',
      context: 'Compare a fingerprint with its owner before confirming it.',
      options: list.map((entry) => ({
        value: entry.id,
        label: `@${entry.username} · ${entry.label}`,
        hint: `${entry.fingerprint} · ${entry.trust === 'blocked' ? 'NEEDS CONFIRMING' : entry.trust}`,
        ...(entry.trust === 'blocked' ? { tone: 'warning' as const } : { dim: entry.trust === 'this' }),
      })),
      onSelect: (id) => {
        const entry = list.find((candidate) => candidate.id === id);
        if (!entry || entry.trust === 'this') return;
        openOverlay({
          kind: 'confirm',
          title: `Trust @${entry.username}’s ${entry.label}?`,
          message: `Fingerprint ${entry.fingerprint}. Confirm only if they read you the same one.`,
          confirmLabel: 'It matches',
          onConfirm: () => run(() => env.trust(session, id), 'Device trusted'),
        });
      },
    });
  };

  const history = async (target: EnvVaultView) => {
    const entries = await env.history(session, target.id);
    openOverlay({
      kind: 'picker',
      title: `History · ${target.environment}`,
      options: entries.slice(0, 100).map((entry, position) => ({
        value: String(position),
        label: `${entry.actor ? `@${entry.actor}` : 'someone'} ${entry.action.replaceAll('_', ' ')}${entry.subject ? ` @${entry.subject}` : ''}${entry.detail ? ` ${entry.detail}` : ''}`,
        hint: formatRelative(entry.createdAt),
      })),
      onSelect: () => undefined,
    });
  };

  useKeys(
    Layer.screen,
    (input, key) => {
      if (key.upArrow || input === 'k') setIndex((current) => Math.max(0, current - 1));
      else if (key.downArrow || input === 'j') setIndex((current) => Math.min(ENV_ENVIRONMENTS.length - 1, current + 1));
      else if (!device && input === 'S') setup();
      else if (!device) return false;
      else if (input === 'c' && owner && !vault) void run(() => env.createVault(session, projectId, environment), `${LABEL[environment]} variables created`);
      else if (input === 'a' && owner && vault) addVariable(vault);
      else if (input === 'd' && owner && vault) removeVariable(vault);
      else if (input === 'g' && vault?.canShare) void grant(vault).catch(() => undefined);
      else if (input === 'u' && owner && vault) revoke(vault);
      else if (input === 's' && vault?.canShare) void run(async () => {
        const shared = await env.sharePending(session, vault.id);
        notify(shared.sealed ? `Shared with ${shared.sealed} device(s)` : 'No device was waiting', 'success', shared.blocked.length ? `Needs confirming: ${shared.blocked.join('; ')}` : undefined);
      });
      else if (input === 'R' && owner && vault) openOverlay({ kind: 'confirm', title: `Rotate the ${environment} key?`, message: 'Every value is re-encrypted with a new key, shared only with who has access now.', confirmLabel: 'Rotate', onConfirm: () => run(() => env.rotate(session, vault.id), 'Key rotated') });
      else if (input === 't') void devices().catch(() => undefined);
      else if (input === 'h' && owner && vault) void history(vault).catch(() => undefined);
      else return false;
      return true;
    },
    active,
  );

  const hints: [string, string][] = !device
    ? [['S', 'set up this machine'], ['esc', 'back']]
    : [
        ['↑↓', 'environment'],
        ...(owner && !vault ? ([['c', 'create']] as [string, string][]) : []),
        ...(owner && vault ? ([['a', 'set'], ['d', 'remove'], ['g', 'give access'], ['u', 'revoke'], ['R', 'rotate'], ['h', 'history']] as [string, string][]) : []),
        ...(!owner && vault?.canShare ? ([['g', 'give access']] as [string, string][]) : []),
        ...(vault?.canShare ? ([['s', 'share with new devices']] as [string, string][]) : []),
        ['t', 'devices'],
        ['esc', 'back'],
      ];

  const listWidth = Math.max(26, Math.min(36, Math.floor(width * 0.34)));
  return (
    <ScreenFrame title={`${projectName} · environment variables`} aside={device ? `${symbols.lock} ${device.label}` : undefined} hints={hints}>
      {!device ? (
        <Box flexDirection="column" gap={1}>
          <Text color={palette.text}>This machine is not set up for shared variables yet.</Text>
          <Text color={palette.muted}>Press S: SOJA creates its keys here (the private ones never leave it) and shows you its fingerprint.</Text>
        </Box>
      ) : (
        <Box gap={1} height={Math.max(8, height - 1)}>
          <Panel title="Environments" width={listWidth}>
            {ENV_ENVIRONMENTS.map((name, position) => {
              const entry = vaults.data?.find((candidate) => candidate.environment === name) ?? null;
              return (
                <Clickable key={name} active={active} onClick={() => setIndex(position)}>
                  <Box backgroundColor={position === index ? palette.selection : undefined} gap={1}>
                    <Text color={palette.accent}>{position === index ? symbols.pointer : ' '}</Text>
                    <Text color={palette.text} bold={position === index}>{LABEL[name]}</Text>
                    <AccessBadge vault={entry} />
                  </Box>
                </Clickable>
              );
            })}
            {vaults.error ? <Text color={palette.danger}>{vaults.error.message}</Text> : null}
          </Panel>
          <Panel title={LABEL[environment]} flexGrow={1} aside={vault ? `${vault.variables} variable${vault.variables === 1 ? '' : 's'} · key v${vault.keyVersion}` : undefined}>
            <VaultDetails vault={vault} owner={owner} environment={environment} />
          </Panel>
        </Box>
      )}
    </ScreenFrame>
  );
}

function AccessBadge({ vault }: { vault: EnvVaultView | null }) {
  if (!vault) return <Text color={palette.faint}>—</Text>;
  if (vault.rotationRequired) return <Badge tone="warning">rotate</Badge>;
  if (!vault.canRead) return <Badge tone="neutral">no access</Badge>;
  if (vault.expiresAt) return <Badge tone="info">{`until ${vault.expiresAt.toLocaleDateString()}`}</Badge>;
  return <Badge tone="success">owner</Badge>;
}

function VaultDetails({ vault, owner, environment }: { vault: EnvVaultView | null; owner: boolean; environment: EnvEnvironment }) {
  if (!vault) {
    return <Text color={palette.muted}>{owner ? `No ${environment} variables yet. Press c to create them.` : `No ${environment} variables yet.`}</Text>;
  }
  return (
    <Box flexDirection="column">
      {vault.rotationRequired ? <Text color={palette.warning}>{`${symbols.info} Someone lost access since the last rotation: press R.`}</Text> : null}
      {!vault.canRead ? (
        <Text color={palette.muted}>You have no access here. Ask a workspace owner to share it with you.</Text>
      ) : (
        <>
          {vault.expiresAt ? <Text color={palette.muted}>{`Your access ends ${vault.expiresAt.toLocaleString()} (${formatRelative(vault.expiresAt)}).`}</Text> : null}
          <Box marginTop={vault.expiresAt ? 1 : 0} flexDirection="column">
            {vault.names.length ? (
              vault.names.map((entry) => (
                <Box key={entry.name} gap={1}>
                  <Text color={palette.text}>{entry.name}</Text>
                  <Text color={palette.faint}>{`${symbols.secret.repeat(8)} · ${formatRelative(entry.updatedAt)}`}</Text>
                </Box>
              ))
            ) : (
              <Text color={palette.muted}>{owner ? 'No variables yet: press a to add one.' : 'No variables yet.'}</Text>
            )}
          </Box>
          <Box marginTop={1} flexDirection="column">
            <Text color={palette.muted}>Use them from the project’s repository while SOJA is open:</Text>
            <Text color={palette.accent}>{`  soja run -e ${environment} -- npm run dev`}</Text>
            <Text color={palette.faint}>Nothing is written to disk. Closing SOJA or losing access stops the program.</Text>
          </Box>
        </>
      )}
      {vault.grants.length ? (
        <Box marginTop={1} flexDirection="column">
          <Text color={palette.text} bold>Temporary access</Text>
          {vault.grants.map((entry) => (
            <Text key={entry.userId} color={palette.muted}>{`@${entry.username} · until ${entry.expiresAt.toLocaleString()}`}</Text>
          ))}
        </Box>
      ) : null}
      {vault.pendingDevices.length ? (
        <Box marginTop={1} flexDirection="column">
          <Text color={palette.warning}>{`${vault.pendingDevices.length} device(s) waiting for these variables: press s.`}</Text>
          {vault.pendingDevices.map((entry) => (
            <Text key={entry.id} color={palette.faint}>{`@${entry.username ?? '?'} · ${entry.label}`}</Text>
          ))}
        </Box>
      ) : null}
    </Box>
  );
}
