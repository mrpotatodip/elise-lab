import { TRACE_LABEL_COPY, TRACE_PHASE_COPY } from "../../constants";
import { traceSpan } from "../../utils";
import { LABEL_ICON, isWork, type ConceptProps } from "./shared";

const clock = (iso: string) => new Date(iso).toLocaleTimeString("en-GB");

export function ConceptConsole({ entries, now, candidateFindings }: ConceptProps) {
  const newest = entries[0];
  const rows = entries.slice(0, 40);
  const age = newest ? Math.max(0, Math.round((now - new Date(newest.endedAt).getTime()) / 1000)) : 0;
  return (
    <div className="overflow-hidden rounded-xl bg-foreground font-mono text-[13px] text-background shadow-inner">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-1 border-b border-background/15 px-4 py-2.5 text-xs text-background/60">
        <span className="flex items-center gap-2 text-mark-success">
          <span className="size-1.5 animate-pulse rounded-full bg-mark-success" />
          live
        </span>
        <span>{newest?.phase ? TRACE_PHASE_COPY[newest.phase].toLowerCase() : "starting"}</span>
        <span className="tabular-nums">{entries.filter(isWork).length} entries</span>
        {candidateFindings !== null && <span className="tabular-nums">{candidateFindings} candidates</span>}
        <span className="ml-auto tabular-nums">last event {traceSpan(age * 1000)} ago</span>
      </div>
      <ul className="max-h-[26rem] overflow-auto py-2">
        {rows.map((entry) => {
          const Icon = LABEL_ICON[entry.label];
          if (!isWork(entry)) {
            return (
              <li key={entry.id} className="trace-line flex items-center gap-3 px-4 py-1 text-background/50">
                <span className="tabular-nums">{clock(entry.startedAt)}</span>
                <span className="h-px flex-1 bg-background/15" />
                <span className="uppercase tracking-widest">
                  {entry.phase ? TRACE_PHASE_COPY[entry.phase] : ""} {entry.label === "phase_started" ? "start" : "end"}
                </span>
                <span className="h-px w-6 bg-background/15" />
              </li>
            );
          }
          return (
            <li key={entry.id} className="trace-line grid grid-cols-[4.5rem_1rem_1fr_auto] items-center gap-3 px-4 py-0.5 hover:bg-background/10">
              <span className="text-background/50 tabular-nums">{clock(entry.startedAt)}</span>
              <Icon aria-hidden="true" className="size-3.5 text-background/60" />
              <span>{TRACE_LABEL_COPY[entry.label]}</span>
              <span className="text-background/50 tabular-nums">{entry.count > 1 ? `×${entry.count}` : ""}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
