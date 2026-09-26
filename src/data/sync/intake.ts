import type { IntakeOperations, IntakeReviewRequest, IntakeSetupResult } from '../../application/intake.js';
import type { Session } from '../../application/types.js';
import type { ReplicaContext } from './services.js';

export class ReplicaIntakeService implements IntakeOperations {
  constructor(private readonly context: ReplicaContext) {}

  configure(session: Session, projectId: string, input: Parameters<IntakeOperations['configure']>[2]): Promise<IntakeSetupResult> {
    return this.context.api.request('PUT', `${this.base(session)}/projects/${projectId}/intake`, input);
  }

  rotateSecret(session: Session, projectId: string): Promise<IntakeSetupResult> {
    return this.context.api.request('POST', `${this.base(session)}/projects/${projectId}/intake/secret`);
  }

  exportContract(session: Session, projectId: string): Promise<Record<string, unknown>> {
    return this.context.api.get(`${this.base(session)}/projects/${projectId}/intake/export`);
  }

  reviewQueue(session: Session, projectId: string): Promise<IntakeReviewRequest[]> {
    return this.context.api.get<IntakeReviewRequest[]>(`${this.base(session)}/projects/${projectId}/intake/requests`);
  }

  decide(session: Session, projectId: string, taskId: string, input: { decision: 'approved' | 'rejected'; note?: string }): Promise<{ ref: string; approvalStatus: 'approved' | 'rejected'; status: string }> {
    return this.context.api.request('POST', `${this.base(session)}/projects/${projectId}/intake/requests/${taskId}/decision`, input);
  }

  async revoke(session: Session, projectId: string): Promise<void> {
    await this.context.api.delete(`${this.base(session)}/projects/${projectId}/intake`);
  }

  private base(session: Session): string {
    return `/v1/workspaces/${session.workspace.id}`;
  }
}
