import type { RunnerJobPhaseValue, TraceEntry, TraceLabelValue } from "@repo/contracts/elise";
import { classifyAgentLine } from "./classify-agent-line";
import { uuidV7 } from "./uuid-v7";

export type TraceState = { offset: number; open: TraceEntry | null };

export const emptyTraceState = (): TraceState => ({ offset: 0, open: null });

const encoder = new TextEncoder();

export type TraceDrain = { state: TraceState; entries: TraceEntry[] };

export const drainTrace = (state: TraceState, text: string, phase: RunnerJobPhaseValue | null, at: Date): TraceDrain => {
  const end = text.lastIndexOf("\n");
  if (end < 0) return { state, entries: [] };
  const whole = text.slice(0, end + 1);
  const labels: TraceLabelValue[] = whole.split("\n").flatMap(classifyAgentLine);
  const stamp = at.toISOString();
  const changed = new Map<string, TraceEntry>();
  let open = state.open;
  let seq = 0;
  for (const label of labels) {
    if (open !== null && open.label === label && open.phase === phase) {
      open = { ...open, count: open.count + 1, endedAt: stamp };
    } else {
      open = { id: uuidV7(at.getTime(), seq++), label, phase, startedAt: stamp, endedAt: stamp, count: 1 };
    }
    changed.set(open.id, open);
  }
  return { state: { offset: state.offset + encoder.encode(whole).length, open }, entries: [...changed.values()] };
};

export const phaseMarker = (label: "phase_started" | "phase_ended", phase: RunnerJobPhaseValue, at: Date): TraceEntry => {
  const time = new Date(at.getTime() + (label === "phase_ended" ? 1 : 0));
  return { id: uuidV7(time.getTime(), 0), label, phase, startedAt: time.toISOString(), endedAt: time.toISOString(), count: 1 };
};
