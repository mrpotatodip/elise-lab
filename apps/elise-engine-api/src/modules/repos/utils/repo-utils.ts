import type { FindingTriageStatusValue, RepoFinding, RepoFindingStateValue, RepoOpen, SeverityCounts } from "@repo/contracts/elise";

type StateInput = {
  history: { state: RepoFindingStateValue; updatedAt: Date } | null;
  triage: { status: FindingTriageStatusValue; updatedAt: Date } | null;
  seenAt: Date;
};

// -----
// The state of a Branch's finding, from the frozen History, a
// person's decision and the newest Scan that saw it. A problem
// closed (by the History, or marked fixed by a person) before a
// Scan saw it again came back: it is `regressed`, and the
// "fixed" decision no longer stands, as in the Verdict. Every
// other decision stands.
// -----
export const branchStateOf = ({ history, triage, seenAt }: StateInput) => {
  const seen = seenAt.getTime();
  const closedByHistory = history?.state === "fixed_by_code" && history.updatedAt.getTime() < seen;
  const markedFixedBefore = triage?.status === "fixed" && triage.updatedAt.getTime() < seen;
  const state: RepoFindingStateValue = closedByHistory || markedFixedBefore ? "regressed" : (history?.state ?? "open");
  return { state, decisionStands: !markedFixedBefore };
};

// -----
// The columns the open counts need, so a count does not
// have to load the words of every finding.
// -----
export type OpenCountRow = Pick<RepoFinding, "state" | "unchecked" | "severity"> & { triage: { status: FindingTriageStatusValue } | null };

const RESOLVED_BY_PERSON: ReadonlySet<FindingTriageStatusValue> = new Set(["fixed", "false_positive", "accepted_risk"]);

// -----
// Still a problem to work on: the history has not closed
// it, and no person has decided it is fixed, a false
// positive or an accepted risk.
// -----
export const isUnresolved = (finding: OpenCountRow): boolean =>
  (finding.state === "open" || finding.state === "regressed") && !(finding.triage && RESOLVED_BY_PERSON.has(finding.triage.status));

const emptySeverity = (): SeverityCounts => ({ critical: 0, high: 0, medium: 0, low: 0, informational: 0 });

export const openCountsOf = (findings: OpenCountRow[]): RepoOpen => {
  const open: RepoOpen = { total: 0, severity: emptySeverity(), needsValidation: 0, regressed: 0, unchecked: 0 };
  for (const finding of findings.filter(isUnresolved)) {
    open.total += 1;
    if (finding.state === "regressed") open.regressed += 1;
    if (finding.unchecked) open.unchecked += 1;
    if (finding.severity === null) open.needsValidation += 1;
    else open.severity[finding.severity] += 1;
  }
  return open;
};

const SEVERITY_ORDER = ["critical", "high", "medium", "low", "informational"] as const;

export const severityRank = (severity: RepoFinding["severity"]): number => (severity === null ? SEVERITY_ORDER.length : SEVERITY_ORDER.indexOf(severity));
