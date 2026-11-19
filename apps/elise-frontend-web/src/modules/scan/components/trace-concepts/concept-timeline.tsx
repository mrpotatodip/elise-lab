import type { ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "#/components/ui/collapsible";
import { cn } from "#/lib/utils";
import { TRACE_LABEL_COPY } from "../../constants";
import { groupTraceByPhase, summarizeTraceGroup, traceAgo, traceSpan } from "../../utils";
import { LABEL_ICON, isWork, tallyByLabel, type ConceptProps } from "./shared";

function Branch({ last, children }: { last: boolean; children: ReactNode }) {
  return (
    <li className="relative pl-6">
      <span aria-hidden="true" className="absolute left-0 top-0 h-[1.0625rem] w-4 rounded-bl-lg border-b border-l border-foreground/20" />
      {!last && <span aria-hidden="true" className="absolute bottom-0 left-0 top-[1.0625rem] w-px bg-foreground/20" />}
      <div className="flex min-h-8 items-center gap-2 text-sm">{children}</div>
    </li>
  );
}

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
          const leaves = current ? work.slice(0, 5) : [];
          const earlier = current ? work.length - leaves.length : 0;
          const tally = current ? [] : tallyByLabel(work);
          return (
            <li key={group.title ?? "scan"} className="relative pb-2 last:pb-0">
              {!last && <span aria-hidden="true" className="absolute bottom-0 left-[0.71875rem] top-7 w-px bg-foreground/20" />}
              <Collapsible defaultOpen={current}>
                <CollapsibleTrigger className="group flex min-h-8 w-full items-center gap-3 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <span
                    className={cn(
                      "z-10 grid size-6 shrink-0 place-items-center rounded-full border bg-background",
                      current ? "border-primary text-primary" : "border-foreground/20 bg-muted text-muted-foreground",
                    )}
                  >
                    {current ? <span className="size-2 animate-pulse rounded-full bg-primary" /> : <Check aria-hidden="true" className="size-3.5" />}
                  </span>
                  <span className="text-sm font-semibold">{group.title}</span>
                  <span className="ml-auto text-xs text-muted-foreground tabular-nums">{traceSpan(summary.spentMs)}</span>
                  <ChevronDown aria-hidden="true" className="size-4 shrink-0 text-muted-foreground transition-transform group-data-[panel-open]:rotate-180" />
                </CollapsibleTrigger>
                <CollapsiblePanel>
                  <ul className="ml-[2.375rem] pb-2 pt-0.5">
                    {leaves.map((entry, leaf) => {
                      const Icon = LABEL_ICON[entry.label];
                      return (
                        <Branch key={entry.id} last={leaf === leaves.length - 1 && earlier === 0}>
                          <Icon aria-hidden="true" className="size-3.5 text-muted-foreground" />
                          <span>{TRACE_LABEL_COPY[entry.label]}</span>
                          {entry.count > 1 && <span className="text-muted-foreground tabular-nums">×{entry.count}</span>}
                          <span className="ml-auto text-xs text-muted-foreground tabular-nums">{traceAgo(entry.endedAt, now)}</span>
                        </Branch>
                      );
                    })}
                    {earlier > 0 && (
                      <Branch last>
                        <span className="text-xs text-muted-foreground tabular-nums">{earlier} earlier</span>
                      </Branch>
                    )}
                    {tally.map(({ label, count }, leaf) => {
                      const Icon = LABEL_ICON[label];
                      return (
                        <Branch key={label} last={leaf === tally.length - 1}>
                          <Icon aria-hidden="true" className="size-3.5 text-muted-foreground" />
                          <span>{TRACE_LABEL_COPY[label]}</span>
                          <span className="ml-auto font-medium tabular-nums">{count}</span>
                        </Branch>
                      );
                    })}
                  </ul>
                </CollapsiblePanel>
              </Collapsible>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
