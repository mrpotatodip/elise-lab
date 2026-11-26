import type { AppDbType } from "#/lib/db-connection";

// -----
// What a write needs: a transaction, the pool, or a withTenant
// transaction.
// -----
export type AuditDb = Pick<AppDbType, "insert">;

export type AuditAction =
  | "team.invite.created"
  | "team.invite.revoked"
  | "team.invite.accepted"
  | "team.two_factor.reset"
  | "team.two_factor_requirement.set"
  | "two_factor.enabled"
  | "two_factor.disabled"
  | "two_factor.locked"
  | "group.created"
  | "group.renamed"
  | "group.deleted"
  | "group.member.added"
  | "group.member.removed"
  | "project.created"
  | "project.renamed"
  | "project.deleted"
  | "repo.project.moved"
  | "finding.triage.set"
  | "finding.risk.accepted"
  | "finding.comment.deleted"
  | "repo.removed"
  | "repo.restored"
  | "usage.budget.updated"
  | "anthropic.key.set"
  | "anthropic.key.removed"
  | "runner.login.approve"
  | "runner.login.deny"
  | "signals.switched";

// -----
// The facts an audit row may carry about the
// change. Never a token, hash or password.
// -----
export type AuditDetails = {
  name?: string;
  email?: string;
  role?: string;
  partyId?: string;
  groupIds?: string[];
  projectId?: string | null;
  reason?: "replaced" | "revoked";
  fingerprint?: string;
  status?: string;
  note?: string | null;
  acceptedUntil?: string | null;
  duplicateOf?: string | null;
  signalId?: string | null;
  monthlyBudgetUsd?: number | null;
  lastFour?: string;
  enabled?: boolean;
  required?: boolean;
  requestIp?: string;
  approverIp?: string;
};

// -----
// subjectId is the row that changed. The Tenant
// goes into `after`, because the table has no
// tenant column.
// -----
export type AuditEntry = {
  actorPartyId: string | null;
  action: AuditAction;
  subjectId: string;
  tenantId: string;
  before?: AuditDetails;
  after?: AuditDetails;
};
