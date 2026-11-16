import {
  SCAN_WORKFLOW_FULL_MAX_POLLS,
  SCAN_WORKFLOW_RUNNER_MAX_POLLS,
} from "#/modules/scan-workflow/constants";

// -----
// How many polls the Workflow waits for the agent: the cloud's 540, or a
// Runner Scan's own count, which also covers the queue and the clone.
// -----
export const maxPollsOf = (runnerId: string | undefined): number => (runnerId ? SCAN_WORKFLOW_RUNNER_MAX_POLLS : SCAN_WORKFLOW_FULL_MAX_POLLS);
