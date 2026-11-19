import { FileText, MessageSquare, Pencil, Search, Terminal, Wrench, type LucideIcon } from "lucide-react";
import type { TraceLabelValue } from "@repo/contracts/elise";
import type { TraceEntry } from "../../schemas";

export type ConceptProps = {
  entries: TraceEntry[];
  now: number;
  candidateFindings: number | null;
};

export const WORK_LABELS = ["reasoning", "reading_files", "searching", "running_command", "writing", "calling_tool"] as const;

export const LABEL_ICON = {
  reasoning: MessageSquare,
  reading_files: FileText,
  searching: Search,
  running_command: Terminal,
  writing: Pencil,
  calling_tool: Wrench,
  phase_started: MessageSquare,
  phase_ended: MessageSquare,
} satisfies Record<TraceLabelValue, LucideIcon>;

export const LABEL_BAR = {
  reasoning: "bg-mark-neutral",
  reading_files: "bg-mark-info",
  searching: "bg-mark-success",
  running_command: "bg-mark-warning",
  writing: "bg-mark-danger",
  calling_tool: "bg-primary",
  phase_started: "bg-mark-neutral",
  phase_ended: "bg-mark-neutral",
} satisfies Record<TraceLabelValue, string>;

export const isWork = (entry: TraceEntry) => entry.label !== "phase_started" && entry.label !== "phase_ended";

export function tallyByLabel(entries: TraceEntry[]) {
  const totals = new Map<TraceLabelValue, number>();
  for (const entry of entries) {
    if (isWork(entry)) totals.set(entry.label, (totals.get(entry.label) ?? 0) + entry.count);
  }
  return WORK_LABELS.map((label) => ({ label, count: totals.get(label) ?? 0 })).filter((item) => item.count > 0);
}
