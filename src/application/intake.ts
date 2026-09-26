import type { Session } from './types.js';

export interface IntakeConfiguration {
  id: string;
  workspaceId: string;
  projectId: string;
  sourceIssuer: string;
  publicJwk: Record<string, string>;
  allowedOrigins: string[];
  allowedRoles: string[];
  endpoint: string;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IntakeSetupResult extends IntakeConfiguration {
  /** Present only when configuring for the first time or rotating. */
  secret: string | null;
}

export interface IntakeReviewRequest {
  id: string;
  ref: string;
  title: string;
  description: string | null;
  createdAt: Date;
  requester: string | null;
  email: string | null;
  sourceRole: string;
}

export interface IntakeOperations {
  configure(session: Session, projectId: string, input: {
    sourceIssuer: string;
    publicJwk: Record<string, string>;
    allowedOrigins: string[];
    allowedRoles: string[];
  }): Promise<IntakeSetupResult>;
  rotateSecret(session: Session, projectId: string): Promise<IntakeSetupResult>;
  exportContract(session: Session, projectId: string): Promise<Record<string, unknown>>;
  reviewQueue(session: Session, projectId: string): Promise<IntakeReviewRequest[]>;
  decide(session: Session, projectId: string, taskId: string, input: { decision: 'approved' | 'rejected'; note?: string }): Promise<{ ref: string; approvalStatus: 'approved' | 'rejected'; status: string }>;
  revoke(session: Session, projectId: string): Promise<void>;
}
