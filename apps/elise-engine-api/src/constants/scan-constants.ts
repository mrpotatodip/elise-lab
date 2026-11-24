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
export const SCAN_PROFILE_CAPS_USD = { quick: 12, standard: 24, deep: 50 } as const satisfies Record<
  (typeof SCAN_PROFILES)[number],
  number
>;

// -----
// Saved files
// -----
export const SCAN_REPORT_FILES = [
  "REPORT.md",
  "findings.json",
  "FINDINGS-DETAIL.md",
  "NEEDS-VALIDATION.md",
  "coverage-ledger.json",
  "run-metadata.json",
] as const;
// -----
// What an older Scan saved besides these: its answer to the Prior
// findings and the list it was given. No new Scan writes them, but
// an old Scan's page still serves them.
// -----
export const SCAN_SERVABLE_FILES = [...SCAN_REPORT_FILES, "recheck.json", "prior-findings.json"] as const;

// -----
// How long a Scan may go without a status change and still count as
// running. A full Scan gets 130 minutes: its 90 minutes of audit
// (SCAN_WORKFLOW_FULL_MAX_POLLS) plus the clone, the launch and the
// save around it. A shorter window would count a live full Scan as
// stalled and let a newer request close it.
// -----
export const SCANS_ACTIVE_WINDOW_MS = 90 * 60 * 1000;
export const SCANS_ACTIVE_FULL_WINDOW_MS = 130 * 60 * 1000;
