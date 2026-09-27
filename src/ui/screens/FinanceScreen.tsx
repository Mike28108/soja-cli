import { Box, Text } from 'ink';
import type { FinanceSummary } from '../../application/finance.js';
import { useAppState } from '../app-state.js';
import { EmptyState } from '../components/EmptyState.js';
import { useLayout } from '../hooks/use-layout.js';
import { useQuery } from '../hooks/use-query.js';
import { Layer } from '../input/dispatcher.js';
import { useKeys } from '../input/KeyProvider.js';
import { Panel } from '../kit/Panel.js';
import { ScreenFrame } from './ScreenFrame.js';
import { palette, symbols } from '../theme/theme.js';

const PERIODS = ['hourly', 'weekly', 'monthly', 'yearly'] as const;
type Period = (typeof PERIODS)[number];

export function FinanceScreen({ active }: { active: boolean }) {
  const { services, session, openOverlay, run, invalidateQueries } = useAppState();
  const { width, height } = useLayout();
  const finance = services.finance;
  const topic = `finance:${session.workspace.id}`;
  const query = useQuery(() => finance ? finance.summary(session) : Promise.reject(new Error('Finance is only available in online workspaces.')), topic, [topic]);
  const data = query.data;
  const enoughMembers = (data?.performanceByMember.length ?? 0) >= 2;
  const ticketHistory = data?.myTicketHistory ?? [];

  useKeys(Layer.screen, (input, key) => {
    if (!finance || key.ctrl || key.meta) return false;
    if (input === 'c') {
      openOverlay({ kind: 'prompt', title: 'Workspace currency (ISO 4217)', initial: data?.currencyCode ?? '', placeholder: 'USD, EUR, CAD…', onSubmit: (value) => {
        const currencyCode = value.trim().toUpperCase();
        try { new Intl.NumberFormat('en', { style: 'currency', currency: currencyCode }); }
        catch { return false; }
        return run(async () => {
          await finance.configureCurrency(session, currencyCode);
          invalidateQueries([topic]);
        }, `Workspace currency set to ${currencyCode}`);
      } });
      return true;
    }
    if (input === 's') {
      if (!data?.currencyCode) return false;
      const digits = new Intl.NumberFormat('en', { style: 'currency', currency: data.currencyCode }).resolvedOptions().maximumFractionDigits ?? 2;
      openOverlay({ kind: 'prompt', title: `Your base salary (${data.currencyCode})`, initial: '', placeholder: `amount and period · e.g. ${digits ? `2500.${'0'.repeat(digits)} monthly` : '2500 monthly'}`, onSubmit: (value) => {
        const match = /^(\d+(?:\.\d{1,3})?)\s+(hourly|weekly|monthly|yearly)$/i.exec(value.trim());
        const periodText = match?.[2]?.toLowerCase();
        if (!match || !periodText || !PERIODS.includes(periodText as Period)) return false;
        const period = periodText as Period;
        const amountMinor = Math.round(Number(match[1]) * 10 ** digits);
        if (!Number.isSafeInteger(amountMinor)) return false;
        return run(async () => {
          await finance.setMySalary(session, { amountMinor, period });
          invalidateQueries([topic]);
        }, 'Your private salary setting was saved');
      } });
      return true;
    }
    if (input === 'p') {
      openOverlay({ kind: 'picker', title: 'Payroll schedule', initial: data?.myPayroll?.schedule ?? null, options: [
        { value: 'monthly', label: 'Once a month · choose a day' },
        { value: 'semimonthly', label: '15th and last day · split salary equally' },
      ], onSelect: (schedule) => {
        if (schedule === 'semimonthly') return run(async () => {
          await finance.configurePayroll(session, { schedule, timeZone: localTimeZone() });
          invalidateQueries([topic]);
        }, 'Payroll set to the 15th and last day of the month');
        openOverlay({ kind: 'prompt', title: 'Monthly payday (1–31)', initial: String(data?.myPayroll?.dayOfMonth ?? 31), placeholder: '31 means the last day of every month', onSubmit: (value) => {
          const dayOfMonth = Number(value.trim());
          if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) return false;
          return run(async () => {
            await finance.configurePayroll(session, { schedule: 'monthly', dayOfMonth, timeZone: localTimeZone() });
            invalidateQueries([topic]);
          }, `Monthly payday set to day ${dayOfMonth}`);
        } });
        return true;
      } });
      return true;
    }
    return false;
  }, active);

  if (!finance) return <ScreenFrame title="Finance" hints={[[ 'esc', 'back' ]]}><EmptyState lines={['Finance is available in online workspaces.']} icon={symbols.dot} /></ScreenFrame>;
  if (query.error && !data) return <ScreenFrame title="Finance" hints={[[ 'esc', 'back' ]]}><EmptyState lines={[query.error.message, query.error.hint ?? '']} icon={symbols.cross} /></ScreenFrame>;
  if (!data) return <ScreenFrame title="Finance" hints={[[ 'c', 'currency' ], [ 's', 'salary' ], [ 'p', 'payday' ], [ 'esc', 'back' ]] }><Text color={palette.faint}>Loading finance…</Text></ScreenFrame>;

  const compact = height < 25 || width < 75;
  const rows = Math.max(1, Math.min(6, height - (compact ? 8 : 12)));
  const financeMembers = data.paidByMember.slice(0, rows);
  const currencyCode = data.currencyCode;
  const performance = data.performanceByMember.slice(0, rows);
  return (
    <ScreenFrame title="Finance & performance" aside={session.workspace.name} hints={[[ 'c', 'currency' ], [ 's', 'my salary' ], [ 'p', 'payday' ], [ 'esc', 'back' ]] }>
      <Box flexDirection="column" gap={1}>
        <Panel title="My base salary" aside="private to you" height={5}>
          <Text color={palette.text}>{data.mySalary && data.currencyCode ? `${money(data.mySalary.amountMinor, data.currencyCode)} / ${data.mySalary.period}` : 'Not set · press s'}</Text>
          <Text color={palette.text}>Payroll · {data.myPayroll ? `${payrollLabel(data.myPayroll)} · next ${formatDate(data.myPayroll.nextPayday)}` : 'not set · press p'}</Text>
          <Text color={palette.faint}>Excluded from ticket earnings and workspace comparisons.</Text>
        </Panel>
        {data.myPayroll && currencyCode ? (
          <Panel title={`Upcoming payroll · ${formatDate(data.myPayroll.nextPayday)}`} height={4}>
            <Text color={palette.text}>{`Base salary${data.myPayroll.salaryAmountMinor === null ? ' (not monthly)' : ''} · ${data.myPayroll.salaryAmountMinor === null ? 'not estimated' : money(data.myPayroll.salaryAmountMinor, currencyCode)}`}</Text>
            <Text color={palette.accent}>{`Ticket income · ${money(data.myPayroll.ticketEarningsMinor, currencyCode)}  |  Estimated total · ${data.myPayroll.salaryAmountMinor === null ? money(data.myPayroll.ticketEarningsMinor, currencyCode) : money(data.myPayroll.totalAmountMinor, currencyCode)}`}</Text>
          </Panel>
        ) : null}
        {!data.currencyCode ? (
          <Panel title="Workspace currency" height={5}>
            <Text color={palette.warning}>Not configured · press c to choose an ISO 4217 currency.</Text>
            <Text color={palette.faint}>Ticket prices and team finance totals use one currency.</Text>
          </Panel>
        ) : null}
        {enoughMembers ? (
          <Box flexDirection={compact ? 'column' : 'row'} gap={1}>
            <Panel title={`Ticket earnings · ${data.currencyCode ?? '—'}`} flexGrow={1}>
              {currencyCode ? financeMembers.map((member) => <ChartRow key={member.id} label={`@${member.username}`} value={member.amountMinor} max={Math.max(1, ...financeMembers.map((row) => row.amountMinor))} text={money(member.amountMinor, currencyCode)} />) : <Text color={palette.faint}>Set the workspace currency to enable paid tickets.</Text>}
              {data.currencyCode && financeMembers.length === 0 ? <Text color={palette.faint}>No ticket earnings yet.</Text> : null}
              <Text color={palette.faint}>Only remunerated tickets moved to Done. Salary is excluded.</Text>
            </Panel>
            <Panel title="Performance · all ticket types" flexGrow={1}>
              {performance.map((member) => <ChartRow key={member.id} label={`@${member.username}`} value={member.ticketCount} max={Math.max(1, ...performance.map((row) => row.ticketCount))} text={`${member.ticketCount} tickets · ${member.openCount} open`} />)}
              <Text color={palette.faint}>Average close time · {performance.map((member) => `${member.username}: ${duration(member.averageCloseMs)}`).join(' · ')}</Text>
              <Text color={palette.faint}>Open age counts every ticket; cancelled tickets are excluded from close averages.</Text>
            </Panel>
          </Box>
        ) : (
          <Panel title="Workspace comparisons" height={4}>
            <Text color={palette.faint}>Comparisons appear when at least two workspace members are eligible.</Text>
          </Panel>
        )}
        <Panel title="My ticket income history" aside="positive income in green" height={Math.max(4, Math.min(ticketHistory.length + 3, rows + 3))}>
          {ticketHistory.length === 0 ? <Text color={palette.faint}>No paid ticket history yet.</Text> : ticketHistory.slice(0, rows).map((entry) => (
            <Box key={entry.id} justifyContent="space-between" gap={1}>
              <Text color={palette.text} wrap="truncate-end" >{`${entry.taskRef} ${entry.taskTitle}`}</Text>
              <Text color={entry.amountMinor > 0 ? palette.accent : entry.amountMinor < 0 ? palette.danger : palette.muted} bold>{money(entry.amountMinor, entry.currencyCode)}</Text>
              <Text color={palette.faint}>{`${entry.eventType} · ${formatDate(entry.createdAt)} → payroll ${formatDate(entry.payrollDate)}`}</Text>
            </Box>
          ))}
        </Panel>
        <Text color={palette.faint}>Values are accrued in SOJA when approved and marked Done; they do not confirm a bank transfer.</Text>
      </Box>
    </ScreenFrame>
  );
}

function ChartRow({ label, value, max, text }: { label: string; value: number; max: number; text: string }) {
  const bar = Math.max(value > 0 ? 1 : 0, Math.round((value / max) * 16));
  return <Box gap={1}><Box width={15}><Text color={palette.muted} wrap="truncate-end">{label}</Text></Box><Text color={palette.accent}>{'█'.repeat(bar)}{'░'.repeat(16 - bar)}</Text><Text color={palette.text}>{text}</Text></Box>;
}

function money(amountMinor: number, currencyCode: string): string {
  const digits = new Intl.NumberFormat('en', { style: 'currency', currency: currencyCode }).resolvedOptions().maximumFractionDigits ?? 2;
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: currencyCode }).format(amountMinor / 10 ** digits);
}

function duration(milliseconds: number | null): string {
  if (milliseconds === null) return 'no closed tickets';
  const hours = milliseconds / 3_600_000;
  return hours < 48 ? `${hours.toFixed(1)}h` : `${(hours / 24).toFixed(1)}d`;
}

function payrollLabel(payroll: NonNullable<FinanceSummary['myPayroll']>): string {
  return payroll.schedule === 'semimonthly' ? '15th and last day' : `monthly on day ${payroll.dayOfMonth}`;
}

function formatDate(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(`${value.slice(0, 10)}T12:00:00`);
  return Number.isNaN(date.valueOf()) ? String(value) : new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
}

function localTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
}
