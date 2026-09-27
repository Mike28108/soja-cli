import type { Session } from './types.js';

export interface FinanceSummary {
  currencyCode: string | null;
  mySalary: { amountMinor: number; period: 'hourly' | 'weekly' | 'monthly' | 'yearly' } | null;
  myPayroll: { schedule: 'monthly' | 'semimonthly'; dayOfMonth: number | null; nextPayday: string; salaryAmountMinor: number | null; ticketEarningsMinor: number; totalAmountMinor: number } | null;
  myTicketHistory: { id: string; taskRef: string; taskTitle: string; eventType: 'accrued' | 'reversed' | 'adjusted'; amountMinor: number; currencyCode: string; createdAt: Date | string; payrollDate: string }[];
  paidByMember: { id: string; username: string; displayName: string; amountMinor: number; currencyCode: string }[];
  performanceByMember: {
    id: string;
    username: string;
    displayName: string;
    ticketCount: number;
    openCount: number;
    openAgeDays: number[];
    closedCount: number;
    averageCloseMs: number | null;
  }[];
}

export interface FinanceOperations {
  summary(session: Session): Promise<FinanceSummary>;
  configureCurrency(session: Session, currencyCode: string): Promise<void>;
  setMySalary(session: Session, input: { amountMinor: number; period: 'hourly' | 'weekly' | 'monthly' | 'yearly' }): Promise<void>;
  configurePayroll(session: Session, input: { schedule: 'monthly' | 'semimonthly'; dayOfMonth?: number; timeZone: string }): Promise<void>;
}
