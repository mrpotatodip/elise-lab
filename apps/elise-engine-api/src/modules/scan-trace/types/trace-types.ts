import type { RunnerJobPhaseValue, TraceLabelValue } from "@repo/contracts/elise";

export type TraceRow = {
  id: string;
  label: TraceLabelValue;
  phase: RunnerJobPhaseValue | null;
  startedAt: Date;
  endedAt: Date;
  count: number;
  cursor: string;
};
