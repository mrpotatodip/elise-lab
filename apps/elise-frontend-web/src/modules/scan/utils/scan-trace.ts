import { TRACE_LABEL_VALUES, type TraceLabelValue } from "@repo/contracts/elise";
import { TRACE_PHASE_COPY } from "../constants";
import type { TraceEntry } from "../schemas";

export type TracePhaseGroup = { key: string; title: string | null; entries: TraceEntry[] };

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

export const isTraceWork = (entry: TraceEntry) => entry.label !== "phase_started" && entry.label !== "phase_ended";

export function tallyTraceLabels(entries: TraceEntry[]) {
  const totals = new Map<TraceLabelValue, number>();
  for (const entry of entries) {
    if (isTraceWork(entry)) totals.set(entry.label, (totals.get(entry.label) ?? 0) + entry.count);
  }
  return TRACE_LABEL_VALUES.map((label) => ({ label, count: totals.get(label) ?? 0 })).filter((item) => item.count > 0);
}

export function traceAgo(iso: string, now: number) {
  const seconds = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  return minutes < 60 ? `${minutes}m ago` : `${Math.floor(minutes / 60)}h ${minutes % 60}m ago`;
}
