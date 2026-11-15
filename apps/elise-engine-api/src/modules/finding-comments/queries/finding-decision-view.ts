import type { FindingDecision } from "@repo/contracts/elise";
import type { TAccessAuditLog } from "@repo/db-elise";
import { authorNameOf, type CommentAuthor } from "./finding-comment-view";

export const DECISION_ACTIONS = ["finding.triage.set", "finding.risk.accepted"];

type DecisionDetails = Pick<FindingDecision, "status"> & { note?: string | null; acceptedUntil?: string | null };

// -----
// An Audit trail row of a triage decision as the thread shows
// it. The actor has no name when the decision was made with the
// service token or the login was removed.
// -----
export const findingDecisionView = (entry: TAccessAuditLog, after: DecisionDetails, actor: CommentAuthor | undefined = null): FindingDecision => ({
  kind: "decision",
  id: entry.id,
  actorName: authorNameOf(actor),
  status: after.status,
  note: after.note ?? null,
  acceptedUntil: after.acceptedUntil ?? null,
  createdAt: entry.createdAt.toISOString(),
});
