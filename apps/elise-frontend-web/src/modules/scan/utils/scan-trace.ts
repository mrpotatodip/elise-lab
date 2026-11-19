import { RUNNER_JOB_PHASE_VALUES, type RunnerJobPhaseValue } from "@repo/contracts/elise";
import { TRACE_PHASE_COPY } from "../constants";
import type { TraceEntry } from "../schemas";

export type TracePhaseGroup = { key: string; title: string | null; entries: TraceEntry[] };

// -----
// Entries come newest first. A run of entries in one Phase is one group, so
// the Phase name heads its run; a Scan without Phases has one group with no
// title.
// -----
export function groupTraceByPhase(entries: TraceEntry[]): TracePhaseGroup[] {
  const groups: TracePhaseGroup[] = [];
  for (const entry of entries) {
    const last = groups.at(-1);
    const title = entry.phase ? TRACE_PHASE_COPY[entry.phase] : null;
    if (last && last.title === title) last.entries.push(entry);
    else groups.push({ key: entry.id, title, entries: [entry] });
  }
  return groups;
}

// -----
// One line for a Phase: how many entries it holds and how long it ran, from
// its first start to its last end.
// -----
export function summarizeTraceGroup(entries: TraceEntry[]) {
  const starts = entries.map((entry) => new Date(entry.startedAt).getTime());
  const ends = entries.map((entry) => new Date(entry.endedAt).getTime());
  return { entries: entries.length, spentMs: Math.max(...ends) - Math.min(...starts) };
}

export function traceSpan(ms: number) {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
}

export type TracePhaseState = "done" | "current" | "pending";
export type TracePhaseStep = { phase: RunnerJobPhaseValue; state: TracePhaseState };

// -----
// Each Phase in run order with where it stands: done once it has an end
// entry, current when it holds the newest entry of a running Scan.
// -----
export function tracePhaseStates(entries: TraceEntry[], active: boolean): TracePhaseStep[] {
  const currentPhase = active ? entries[0]?.phase : null;
  return RUNNER_JOB_PHASE_VALUES.map((phase) => {
    const ended = entries.some((entry) => entry.phase === phase && entry.label === "phase_ended");
    const state: TracePhaseState = ended ? "done" : phase === currentPhase ? "current" : "pending";
    return { phase, state };
  });
}

export function traceAgo(iso: string, now: number) {
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  return minutes < 60 ? `${minutes}m ago` : `${Math.floor(minutes / 60)}h ${minutes % 60}m ago`;
}
