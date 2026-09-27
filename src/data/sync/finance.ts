import type { FinanceOperations } from '../../application/finance.js';
import type { Session } from '../../application/types.js';
import type { ReplicaContext } from './services.js';

export class ReplicaFinanceService implements FinanceOperations {
  constructor(private readonly context: ReplicaContext) {}

  summary(session: Session) {
    return this.context.api.get<Awaited<ReturnType<FinanceOperations['summary']>>>(`/v1/workspaces/${session.workspace.id}/finance`);
  }

  async configureCurrency(session: Session, currencyCode: string): Promise<void> {
    await this.context.api.request('PUT', `/v1/workspaces/${session.workspace.id}/finance/currency`, { currencyCode });
  }

  async setMySalary(session: Session, input: Parameters<FinanceOperations['setMySalary']>[1]): Promise<void> {
    await this.context.api.request('PUT', `/v1/workspaces/${session.workspace.id}/finance/salary`, input);
  }

  async configurePayroll(session: Session, input: Parameters<FinanceOperations['configurePayroll']>[1]): Promise<void> {
    await this.context.api.request('PUT', `/v1/workspaces/${session.workspace.id}/finance/payroll`, input);
  }
}
