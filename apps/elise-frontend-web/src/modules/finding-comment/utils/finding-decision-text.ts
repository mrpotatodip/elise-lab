import type { FindingDecision } from "@repo/contracts/elise";

const END_DATE = new Intl.DateTimeFormat("en", { month: "short", day: "numeric", timeZone: "UTC" });

const DECISION_VERBS = {
  open: "reopened this",
  fixed: "marked this fixed. A scan has not confirmed it yet.",
  false_positive: "marked this a false positive",
  duplicate: "marked this a duplicate of another finding",
} satisfies Record<Exclude<FindingDecision["status"], "accepted_risk">, string>;

// -----
// What a decision says after the name: "marked this fixed",
// "accepted the risk until Jan 12". A fixed mark adds that no scan
// has confirmed it, as the finding banner says. The end date reads in UTC
// so the server and the browser print the same day.
// -----
export const decisionText = (decision: Pick<FindingDecision, "status" | "acceptedUntil">): string =>
  decision.status === "accepted_risk"
    ? decision.acceptedUntil
      ? `accepted the risk until ${END_DATE.format(new Date(decision.acceptedUntil))}`
      : "accepted the risk"
    : DECISION_VERBS[decision.status];
