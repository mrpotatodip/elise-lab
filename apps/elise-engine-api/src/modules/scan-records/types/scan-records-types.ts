import type { scanFindings, scans } from "@repo/db-elise/schema";
import type { SCAN_PROFILES } from "@repo/contracts/elise";
import type { SCAN_RECORDS_PROFILE_CHECK_FILES, SCAN_RECORDS_PROFILE_CHECK_ROW_IDS } from "#/modules/scan-records/constants";
import type { ProfileCheckFinding, ProfileCheckMetadata, ProfileCheckUnit } from "#/modules/scan-records/schemas";
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
export type ScanRecord = { scan: NewScanRow; findings: NewFindingRow[] };

// -----
// Service inputs
// -----
export type RecordScanEnv = Pick<Bindings, "REPORTS" | "DATABASE_URL">;

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
