import type { RunnerJobPhaseValue, TraceLabelValue } from "@repo/contracts/elise";

export const TRACE_LABEL_COPY = {
  reasoning: "Reasoning",
  reading_files: "Reading files",
  searching: "Searching the code",
  running_command: "Running a command",
  writing: "Writing",
  calling_tool: "Calling a tool",
  phase_started: "Phase started",
  phase_ended: "Phase ended",
} satisfies Record<TraceLabelValue, string>;

export const TRACE_PHASE_COPY = {
  recon: "Recon",
  hunt: "Hunt",
  check: "Check",
  report: "Report",
} satisfies Record<RunnerJobPhaseValue, string>;

export const TRACE_NO_PHASE_COPY = "Scan";

// -----
// The notice shows when nothing new arrived for this long. It only informs:
// the Scan is not stopped or failed by it.
// -----
export const TRACE_QUIET_MS = 3 * 60 * 1000;

export const TRACE_POLL_MS = 5000;
