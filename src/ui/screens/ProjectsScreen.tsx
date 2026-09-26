import { basename } from 'node:path';
import { dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { generateKeyPairSync } from 'node:crypto';
import { mkdir, open as openFile, unlink } from 'node:fs/promises';
import { resolvePaths } from '../../config/paths.js';
import { Box, Text } from 'ink';
import { useAppState } from '../app-state.js';
import { EmptyState } from '../components/EmptyState.js';
import { EMPTY_PROJECTS } from '../copy.js';
import { useFlows } from '../hooks/use-flows.js';
import { useLayout } from '../hooks/use-layout.js';
import { useList } from '../hooks/use-list.js';
import { useQuery } from '../hooks/use-query.js';
import { Layer } from '../input/dispatcher.js';
import { useKeys } from '../input/KeyProvider.js';
import { palette, symbols } from '../theme/theme.js';
import { Clickable } from '../kit/Clickable.js';
import { Gauge } from '../kit/Gauge.js';
import { ScreenFrame } from './ScreenFrame.js';

export function ProjectsScreen({ active }: { active: boolean }) {
  const { services, session, go, openOverlay, run, notify } = useAppState();
  const { width, height } = useLayout();
  const query = useQuery(() => services.projects.list(session), `projects:${session.workspace.id}`, [`projects:${session.workspace.id}`, `tasks:${session.workspace.id}`]);
  const projects = query.data ?? [];
  const rows = Math.max(1, height - 3);
  const list = useList(projects.length, rows);

  const flows = useFlows();

  useKeys(
    Layer.screen,
    (input, key) => {
      if (list.handleKey(input, key)) return true;
      if (key.ctrl || key.meta) return false;
      const project = projects[list.index];
      if (key.return && project) go({ type: 'push', route: { name: 'project', projectId: project.id } });
      else if (input === 'n') flows.newProject();
      else if (input === 'r' && project) void flows.pickRepository(project);
      else if (input === 'e' && project) flows.editProject(project);
      else if (input === 'i' && project && services.intake) configureIntake(project);
      else return false;
      return true;
    },
    active,
  );

  const wide = width >= 88;
  // Fixed columns: pointer, key, active; then progress, review, blocked, done gauge and repo when wide.
  const nameWidth = Math.max(10, width - 2 - 9 - 8 - (wide ? 10 + 8 + 9 + 17 + 16 : 0) - 1);
  return (
    <ScreenFrame
      title="Projects"
      aside={projects.length ? `${projects.length} project${projects.length === 1 ? '' : 's'}` : undefined}
      hints={[
        ['↑↓', 'move'],
        ['enter', 'open'],
        ['n', 'new project'],
        ['r', 'link repo'],
        ['e', 'edit'],
        ...(services.intake ? [['i', 'ticket API'] as const] : []),
        ['esc', 'back'],
      ]}
    >
      {projects.length === 0 && !query.loading ? (
        <EmptyState lines={EMPTY_PROJECTS} icon={symbols.dot} />
      ) : (
        <Clickable onWheel={(direction) => list.select(list.index + direction)} active={active} flexDirection="column">
          <Box>
            <Box width={2} />
            <Header width={9} text="KEY" />
            <Box width={nameWidth} flexShrink={0}>
              <Text color={palette.faint} bold>
                NAME
              </Text>
            </Box>
            <Header width={8} text="ACTIVE" right />
            {wide ? (
              <>
                <Header width={10} text="PROGRESS" right />
                <Header width={8} text="REVIEW" right />
                <Header width={9} text="BLOCKED" right />
                <Box width={17} paddingLeft={3}>
                  <Text color={palette.faint} bold>
                    DONE
                  </Text>
                </Box>
                <Box width={16} paddingLeft={2}>
                  <Text color={palette.faint} bold>
                    REPO
                  </Text>
                </Box>
              </>
            ) : null}
          </Box>
          {projects.slice(list.offset, list.offset + rows - 1).map((project, position) => {
            const index = list.offset + position;
            const selected = index === list.index;
            const bg = selected ? { backgroundColor: palette.selection } : {};
            const total = Object.values(project.counts).reduce((sum, count) => sum + count, 0);
            return (
              <Clickable
                key={project.id}
                active={active}
                onClick={() => (selected ? go({ type: 'push', route: { name: 'project', projectId: project.id } }) : list.select(index))}
              >
                <Box flexGrow={1} {...bg}>
                  <Box width={2}>
                    <Text color={palette.accent}>{selected ? symbols.pointer : ' '}</Text>
                  </Box>
                  <Box width={9}>
                    <Text color={selected ? palette.accent : palette.muted} bold={selected}>
                      {project.key}
                    </Text>
                  </Box>
                  <Box width={nameWidth} flexShrink={0}>
                    <Text color={palette.text} bold={selected} wrap="truncate-end">
                      {project.name}
                    </Text>
                  </Box>
                  <Count width={8} value={project.active} color={palette.text} />
                  {wide ? (
                    <>
                      <Count width={10} value={project.counts.in_progress} color={palette.warning} />
                      <Count width={8} value={project.counts.review} color={palette.info} />
                      <Count width={9} value={project.counts.blocked} color={palette.danger} />
                      <Box width={17} paddingLeft={3}>
                        <Gauge value={project.counts.done} total={total} width={8} />
                      </Box>
                      <Box width={16} paddingLeft={2}>
                        <Text color={project.repositoryPath ? palette.muted : palette.faint} wrap="truncate-end">
                          {project.repositoryPath ? basename(project.repositoryPath) : 'not linked · r'}
                        </Text>
                      </Box>
                    </>
                  ) : null}
                </Box>
              </Clickable>
            );
          })}
        </Clickable>
      )}
    </ScreenFrame>
  );

  function configureIntake(project: { id: string; key: string; name: string }) {
    if (!services.intake) return;
    const intake = services.intake;
    openOverlay({
      kind: 'picker',
      title: `Ticket API · ${project.key}`,
      context: 'workspace owner only · secrets stay on this machine until moved to Supabase',
      options: [
        { value: 'review', label: 'Review pending tickets', hint: 'approve or reject external requests' },
        { value: 'configure', label: 'Configure / rotate key and export', hint: 'generates a new RSA keypair' },
        { value: 'revoke', label: 'Revoke project integration', hint: 'stops new external tickets', tone: 'danger' },
      ],
      onSelect: (value) => {
        if (value === 'review') return showReviewQueue();
        if (value === 'configure') return beginSetup();
        openOverlay({
          kind: 'confirm',
          title: 'Revoke ticket API?',
          context: project.key,
          message: 'External forms will stop creating tickets until this project is configured again.',
          confirmLabel: 'Revoke API',
          tone: 'danger',
          onConfirm: () => run(async () => intake.revoke(session, project.id), `Ticket API revoked for ${project.key}`),
        });
      },
    });

    function showReviewQueue() {
      void intake.reviewQueue(session, project.id).then((requests) => {
        if (!requests?.length) {
          notify(`No pending tickets for ${project.key}`, 'info');
          return;
        }
        openOverlay({
          kind: 'picker',
          title: `Pending tickets · ${project.key}`,
          context: 'Owner review · approve to publish to the team, reject to cancel',
          options: requests.map((request) => ({ value: request.id, label: `${request.ref} · ${request.title}`, hint: `${request.requester ?? request.email ?? request.sourceRole} · ${new Date(request.createdAt).toLocaleDateString()}` })),
          onSelect: (taskId) => {
            const request = requests.find((item) => item.id === taskId);
            if (!request) return;
            openOverlay({
              kind: 'picker',
              title: `${request.ref} · ${request.title}`,
              context: `${request.requester ?? request.email ?? 'External requester'} · role ${request.sourceRole}${request.description ? `\n\n${request.description}` : ''}`,
              options: [
                { value: 'approved', label: 'Approve ticket', hint: 'makes it visible to workspace members' },
                { value: 'rejected', label: 'Reject ticket', hint: 'marks it cancelled', tone: 'danger' },
              ],
              onSelect: (decision) => run(
                async () => intake.decide(session, project.id, taskId, { decision: decision as 'approved' | 'rejected' }),
                `${request.ref} ${decision}`,
              ),
            });
          },
        });
      }).catch((error: unknown) => notify(error instanceof Error ? error.message : 'Could not load pending tickets', 'error'));
    }

    function beginSetup() {
    const promptOrigin = (sourceIssuer: string) => openOverlay({
      kind: 'prompt',
      title: 'Allowed app origins',
      context: 'comma separated exact origins · HTTPS only',
      placeholder: 'https://portal.example.com',
      onSubmit: (originInput) => {
        const allowedOrigins = originInput.split(',').map((value) => value.trim()).filter(Boolean);
        if (!allowedOrigins.length || allowedOrigins.some((value) => {
          try { const parsed = new URL(value); return parsed.protocol !== 'https:' || parsed.origin !== value.replace(/\/$/, ''); }
          catch { return true; }
        })) return false;
        return promptRoles(sourceIssuer, allowedOrigins);
      },
    });
    const promptRoles = (sourceIssuer: string, allowedOrigins: string[]) => openOverlay({
      kind: 'prompt',
      title: 'Allowed application roles',
      context: 'comma separated exact role names from your server-side role lookup',
      placeholder: 'support_customer, workspace_admin',
      onSubmit: (rolesInput) => {
        const allowedRoles = [...new Set(rolesInput.split(',').map((value) => value.trim()).filter(Boolean))];
        if (!allowedRoles.length || allowedRoles.some((role) => !/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/.test(role))) return false;
        return promptExportPath(sourceIssuer, allowedOrigins, allowedRoles);
      },
    });
    const promptExportPath = (sourceIssuer: string, allowedOrigins: string[], allowedRoles: string[]) => openOverlay({
      kind: 'prompt',
      title: 'Save integration credentials',
      context: 'contains a private key and secret; keep it outside source control',
      initial: join(resolvePaths().configDir, 'intake', `.env.${project.key.toLowerCase()}`),
      placeholder: join(resolvePaths().configDir, 'intake', `.env.${project.key.toLowerCase()}`),
      onSubmit: async (outputInput) => {
        const outputPath = resolve(outputInput.startsWith('~/') ? join(homedir(), outputInput.slice(2)) : outputInput);
        const ok = await run(async () => {
          await mkdir(dirname(outputPath), { recursive: true, mode: 0o700 });
          const openApiPath = `${outputPath}.openapi.json`;
          const envHandle = await openFile(outputPath, 'wx', 0o600);
          let apiHandle;
          let credentialsSaved = false;
          try {
            apiHandle = await openFile(openApiPath, 'wx', 0o600);
          } catch (error) {
            await envHandle.close();
            await unlink(outputPath).catch(() => undefined);
            throw error;
          }
          try {
            const pair = generateKeyPairSync('rsa', { modulusLength: 3072 });
            const publicJwk = pair.publicKey.export({ format: 'jwk' }) as unknown as Record<string, string>;
            const privateJwk = JSON.stringify(pair.privateKey.export({ format: 'jwk' }));
            const configured = await intake.configure(session, project.id, { sourceIssuer, publicJwk, allowedOrigins, allowedRoles });
            const credentials = configured.secret ? configured : await intake.rotateSecret(session, project.id);
            const contract = await intake.exportContract(session, project.id);
            const privateEnv = [
              `APP_ORIGINS='${allowedOrigins.join(',')}'`,
              `SUPABASE_AUTH_ISSUER='${sourceIssuer}'`,
              `SOJA_API_URL='${services.environment.mode === 'remote' ? services.environment.server : ''}'`,
              `SOJA_INTEGRATION_ID='${credentials.id}'`,
              `SOJA_PROJECT_ID='${project.id}'`,
              `SOJA_INTEGRATION_SECRET='${credentials.secret}'`,
              `SOJA_ASSERTION_PRIVATE_JWK='${privateJwk}'`,
              '',
            ].join('\n');
            await envHandle.writeFile(privateEnv, 'utf8');
            await envHandle.chmod(0o600);
            credentialsSaved = true;
            await apiHandle.writeFile(`${JSON.stringify(contract, null, 2)}\n`, 'utf8');
            await apiHandle.chmod(0o600);
          } catch (error) {
            await Promise.all([envHandle.close().catch(() => undefined), apiHandle.close().catch(() => undefined)]);
            if (!credentialsSaved) await unlink(outputPath).catch(() => undefined);
            await unlink(openApiPath).catch(() => undefined);
            if (credentialsSaved) throw new Error(`Credentials were saved at ${outputPath}, but OpenAPI export failed. Keep that file safe and retry export.`);
            throw error;
          } finally {
            await Promise.all([envHandle.close().catch(() => undefined), apiHandle.close().catch(() => undefined)]);
          }
          return openApiPath;
        });
        if (ok) notify(`Ticket API configured for ${project.key}`, 'success', `Credentials: ${outputPath} · OpenAPI: ${outputPath}.openapi.json · move credentials to Supabase Secrets and delete this local file when done.`);
        return ok;
      },
    });
    openOverlay({
      kind: 'prompt',
      title: `Supabase Auth issuer · ${project.name}`,
      context: 'must exactly match the iss claim of Auth access tokens',
      placeholder: 'https://project-ref.supabase.co/auth/v1',
      onSubmit: (issuerInput) => {
        let sourceIssuer: string;
        try {
          const url = new URL(issuerInput.trim());
          if (url.protocol !== 'https:' || url.search || url.hash || url.username || url.password) return false;
          sourceIssuer = url.href.replace(/\/$/, '');
        } catch { return false; }
        return promptOrigin(sourceIssuer);
      },
    });
    }
  }
}

function Header({ width, text, right = false }: { width: number; text: string; right?: boolean }) {
  return (
    <Box width={width} justifyContent={right ? 'flex-end' : 'flex-start'}>
      <Text color={palette.faint} bold>
        {text}
      </Text>
    </Box>
  );
}

function Count({ width, value, color }: { width: number; value: number; color?: string }) {
  return (
    <Box width={width} justifyContent="flex-end">
      <Text color={value ? color : palette.faint}>
        {value ? String(value) : symbols.dot}
      </Text>
    </Box>
  );
}
