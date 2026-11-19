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

export function traceAgo(iso: string, now: number) {
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  return minutes < 60 ? `${minutes}m ago` : `${Math.floor(minutes / 60)}h ${minutes % 60}m ago`;
}
