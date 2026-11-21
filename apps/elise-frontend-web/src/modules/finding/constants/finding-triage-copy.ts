import type { FindingTriageStatus } from "../schemas";

export const FINDING_TRIAGE_OPTIONS = [
  { value: "open", label: "Open" },
  { value: "fixed", label: "Fixed" },
  { value: "false_positive", label: "False positive" },
  { value: "accepted_risk", label: "Accepted risk" },
  { value: "duplicate", label: "Duplicate" },
] as const satisfies readonly { value: FindingTriageStatus; label: string }[];
