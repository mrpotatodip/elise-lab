import { SCAN_WORKFLOW_FULL_MAX_POLLS, SCAN_WORKFLOW_RUNNER_MAX_POLLS } from "#/modules/scan-workflow/constants";

export const maxPollsOf = (runnerId: string | undefined): number =>
  runnerId ? SCAN_WORKFLOW_RUNNER_MAX_POLLS : SCAN_WORKFLOW_FULL_MAX_POLLS;
