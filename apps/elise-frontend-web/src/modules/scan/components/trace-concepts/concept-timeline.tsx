import { Check } from "lucide-react";
import { cn } from "#/lib/utils";
import { TRACE_LABEL_COPY, TRACE_PHASE_COPY } from "../../constants";
import { groupTraceByPhase, summarizeTraceGroup, traceAgo, traceSpan } from "../../utils";
import { LABEL_ICON, isWork, tallyByLabel, type ConceptProps } from "./shared";

export function ConceptTimeline({ entries, now, candidateFindings }: ConceptProps) {
  const groups = groupTraceByPhase(entries);
  const newest = entries.find(isWork);
  return (
    <div className="grid gap-5">
      {newest && (
        <div className="flex items-center gap-3 rounded-xl bg-primary/5 px-4 py-3 ring-1 ring-primary/15">
          <span className="relative flex size-2.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary/60" />
            <span className="relative inline-flex size-2.5 rounded-full bg-primary" />
          </span>
          <p className="flex-1 text-base font-semibold">
            {TRACE_LABEL_COPY[newest.label]}
            {newest.count > 1 && <span className="font-normal text-muted-foreground tabular-nums"> ×{newest.count}</span>}
          </p>
          <p className="text-xs text-muted-foreground tabular-nums">{traceAgo(newest.endedAt, now)}</p>
          {candidateFindings !== null && <p className="text-xs text-muted-foreground">{candidateFindings} candidates</p>}
        </div>
      )}
      <ol>
        {groups.map((group, index) => {
          const current = index === 0;
          const work = group.entries.filter(isWork);
          const summary = summarizeTraceGroup(group.entries);
          const last = index === groups.length - 1;
          return (
            <li key={group.key} className="relative grid grid-cols-[1.5rem_1fr] gap-x-4 pb-6 last:pb-0">
              {!last && <span aria-hidden="true" className="absolute bottom-0 left-[0.71875rem] top-7 w-px bg-border" />}
              <span
                className={cn(
                  "z-10 mt-0.5 grid size-6 place-items-center rounded-full border bg-background",
                  current ? "border-primary text-primary" : "border-foreground/20 bg-muted text-muted-foreground",
                )}
              >
                {current ? <span className="size-2 animate-pulse rounded-full bg-primary" /> : <Check aria-hidden="true" className="size-3.5" />}
              </span>
              <div className="grid gap-2">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-sm font-semibold">{group.title}</h3>
                  <span className="text-xs text-muted-foreground tabular-nums">{traceSpan(summary.spentMs)}</span>
                </div>
                {current ? (
                  <ul className="grid gap-1.5">
                    {work.slice(0, 5).map((entry) => {
                      const Icon = LABEL_ICON[entry.label];
                      return (
                        <li key={entry.id} className="flex items-center gap-2 text-sm">
                          <Icon aria-hidden="true" className="size-3.5 text-muted-foreground" />
                          <span>{TRACE_LABEL_COPY[entry.label]}</span>
                          {entry.count > 1 && <span className="text-muted-foreground tabular-nums">×{entry.count}</span>}
                          <span className="ml-auto text-xs text-muted-foreground tabular-nums">{traceAgo(entry.endedAt, now)}</span>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <ul className="flex flex-wrap gap-1.5">
                    {tallyByLabel(work).map(({ label, count }) => (
                      <li key={label} className="rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground tabular-nums">
                        {TRACE_LABEL_COPY[label]} <span className="font-medium text-foreground">{count}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      <p className="text-xs text-muted-foreground">Phase {Math.min(groups.length, 4)} of 4 · {TRACE_PHASE_COPY[groups[0]?.entries[0]?.phase ?? "recon"]} is running</p>
    </div>
  );
}
