// -----
// Scan options
// -----
import type { SCAN_PROFILES } from "@repo/contracts/elise";

export { SCAN_EFFORTS, SCAN_MODELS, SCAN_PROFILES, SCAN_SKILLS } from "@repo/contracts/elise";

// -----
// The Budget cap of a full Scan for each profile, in dollars: the
// most it may spend, and what it gets when the request names no cap.
// A request may lower it, never raise it. PROVISIONAL: nobody has
// measured a full Scan yet, so these are guesses to change after the
// first real Scans (#142). MAX_BUDGET_FULL_USD guards the table: a
// profile whose cap is above it refuses its Scans before any hold.
// -----
export const SCAN_PROFILE_CAPS_USD = { quick: 6, standard: 12, deep: 18 } as const satisfies Record<(typeof SCAN_PROFILES)[number], number>;

// -----
// Saved files
// -----
export const SCAN_REPORT_FILES = [
  "REPORT.md",
  "findings.json",
  "FINDINGS-DETAIL.md",
  "NEEDS-VALIDATION.md",
  "coverage-ledger.json",
  "recheck.json",
  "prior-findings.json",
  "run-metadata.json",
] as const;
export const SCAN_SERVABLE_FILES = SCAN_REPORT_FILES;
