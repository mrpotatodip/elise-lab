import type { scanFindings, scanRepoFindings, scans } from "@repo/db-elise/schema";
import type { FindingOriginValue, FindingSeverityValue, FindingStatusValue, FindingTriageStatusValue, SCAN_PROFILES } from "@repo/contracts/elise";
import type { SCAN_RECORDS_PROFILE_CHECK_FILES, SCAN_RECORDS_PROFILE_CHECK_ROW_IDS } from "#/modules/scan-records/constants";
import type { LiteFinding, ProfileCheckFinding, ProfileCheckMetadata, ProfileCheckUnit, Recheck } from "#/modules/scan-records/schemas";
import type { Bindings } from "#/types/variables";

// -----
// Rows to write
// -----
export type NewScanRow = typeof scans.$inferInsert;
export type NewFindingRow = typeof scanFindings.$inferInsert;
// -----
// The branch a scan belongs to: id is null for a one-off scan
// (no History) and reason says why; name is the branch it read,
// when known.
// -----
export type ScanBranch = { id: string | null; name: string | null; reason: string | null };
export type ScanRecord = { scan: NewScanRow; findings: NewFindingRow[]; history: NewHistoryRow[] };

// -----
// Service inputs
// -----
export type RecordScanEnv = Pick<Bindings, "REPORTS" | "DATABASE_URL">;

// -----
// History: what a repo's problems look like before and
// after a scan
// -----
export type HistoryRow = typeof scanRepoFindings.$inferSelect;
export type NewHistoryRow = typeof scanRepoFindings.$inferInsert;

// -----
// A problem the agent is asked to re-check. priorId is
// its fingerprint. The words come from the scan that
// last saw it.
// -----
export type PriorFinding = {
  priorId: string;
  status: FindingStatusValue;
  severity: FindingSeverityValue | null;
  title: string;
  class: string;
  file: string | null;
  line: number | null;
};

export type FoundFinding = { finding: LiteFinding; fingerprint: string };

export type PlannedFinding = { finding: LiteFinding; fingerprint: string; origin: FindingOriginValue };

export type PriorTally = { given: number; carried: number; closed: number; unchecked: number };

export type HistoryPlan = { findings: PlannedFinding[]; history: NewHistoryRow[]; tally: PriorTally };

export type PlanInput = {
  scanId: string;
  repoId: string;
  branchId: string;
  tenantId: string;
  history: Map<string, HistoryRow>;
  triage: Map<string, FindingTriageStatusValue>;
  given: PriorFinding[];
  found: FoundFinding[];
  recheck: Recheck;
};

export type HistoryContext = Pick<PlanInput, "history" | "triage" | "given">;

// -----
// Profile check: the table of what each profile requires, what a
// check reads of a Runner Scan and what it says
// -----
export type ScanProfile = (typeof SCAN_PROFILES)[number];
export type ProfileCheckRowId = (typeof SCAN_RECORDS_PROFILE_CHECK_ROW_IDS)[number];
export type ProfileCheckRow = {
  id: ProfileCheckRowId;
  profile: ScanProfile;
  requirement: string;
  file: (typeof SCAN_RECORDS_PROFILE_CHECK_FILES)[number];
  field: string;
  needsSkillChange: boolean;
};
export type ProfileCheck = { result: "met" } | { result: "lesser"; profile: ScanProfile } | { result: "unmet" };
export type ProfileCheckFiles = {
  report: string | null;
  ledger: string | null;
  metadata: string | null;
  findings: string | null;
};
export type ProfileCheckFacts = {
  units: ProfileCheckUnit[];
  metadata: ProfileCheckMetadata;
  findings: ProfileCheckFinding[];
  maxWave: number;
};
