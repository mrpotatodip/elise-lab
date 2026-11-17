import { RUNNER_JOB_QUEUE_TIMEOUT_MS } from "@repo/contracts/elise";

// -----
// Polling
// -----
export const SCAN_WORKFLOW_POLL_SECONDS = 10;

// -----
// The time limits. The whole audit may take 90 minutes. Each Phase has a slot of its own, so a slow
// Phase cannot use the time of the Phases after it; the slots add up to
// the total. Provisional until a measurement of real full Scans.
// -----
export const SCAN_WORKFLOW_FULL_MAX_POLLS = 540;
// -----
// A Scan on a Runner waits longer: the Runner app's 90 minutes of
// Phases, plus up to RUNNER_JOB_QUEUE_TIMEOUT_MS before the app claims
// the job, plus 20 minutes for the clone (5), the validators (about 4
// over two rounds) and the repair run (5), which the 90 minutes leave
// out: the app can use about 14 of them, and the rest is a cushion. The
// total, 120 minutes, stays inside SCANS_ACTIVE_FULL_WINDOW_MS (130).
// Only the Runner path reads it.
// -----
export const SCAN_WORKFLOW_RUNNER_CLONE_AND_VALIDATE_MINUTES = 20;
export const SCAN_WORKFLOW_RUNNER_MAX_POLLS = Math.ceil(
  (SCAN_WORKFLOW_FULL_MAX_POLLS * SCAN_WORKFLOW_POLL_SECONDS * 1000 + RUNNER_JOB_QUEUE_TIMEOUT_MS + SCAN_WORKFLOW_RUNNER_CLONE_AND_VALIDATE_MINUTES * 60 * 1000) /
    (SCAN_WORKFLOW_POLL_SECONDS * 1000),
);
export const SCAN_WORKFLOW_FULL_PHASE_MINUTES = { recon: 10, hunt: 45, check: 25, report: 10 } as const;

// -----
// Steps
// -----
export const SCAN_WORKFLOW_RECORD_RETRY = { limit: 3, delay: "5 seconds", backoff: "exponential" } as const;
export const SCAN_WORKFLOW_RECORD_TIMEOUT = "2 minutes";
export const SCAN_WORKFLOW_RETRY_ONCE = { limit: 1, delay: "10 seconds" } as const;
export const SCAN_WORKFLOW_PREPARE_TIMEOUT = "10 minutes";
export const SCAN_WORKFLOW_LAUNCH_TIMEOUT = "5 minutes";
