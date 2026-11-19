import type { ReactNode } from "react";
import { Check, ChevronDown } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "#/components/ui/collapsible";
import { cn } from "#/lib/utils";
import { TRACE_LABEL_COPY } from "../../constants";
import { groupTraceByPhase, summarizeTraceGroup, traceAgo, traceSpan } from "../../utils";
import { LABEL_ICON, isWork, tallyByLabel, type ConceptProps } from "./shared";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;

function Count({ value }: { value: number }) {
  return (
    <span className="font-normal tabular-nums text-muted-foreground/70">×{value}</span>
  );
}

function Time({ children }: { children: ReactNode }) {
  return <span className="ml-2 text-xs font-normal tabular-nums text-muted-foreground/70">{children}</span>;
}

function Branch({ last, children }: { last: boolean; children: ReactNode }) {
  const reduce = useReducedMotion();
  return (
    <motion.li layout={reduce ? false : "position"} transition={{ duration: 0.2, ease: EASE_OUT }}>
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2, ease: EASE_OUT }} className="relative pl-6">
        <span aria-hidden="true" className="absolute left-0 top-0 h-[1.0625rem] w-4 rounded-bl-lg border-b border-l border-foreground/20" />
        {!last && <span aria-hidden="true" className="absolute bottom-0 left-0 top-[1.0625rem] w-px bg-foreground/20" />}
        <div className="flex min-h-8 items-center gap-2 text-sm">{children}</div>
      </motion.div>
    </motion.li>
  );
}

export function ConceptTimeline({ entries, now, candidateFindings }: ConceptProps) {
  const reduce = useReducedMotion();
  const groups = groupTraceByPhase(entries);
  const newest = entries.find(isWork);
  return (
    <div className="grid gap-5">
      {newest && (
        <div className="flex items-center gap-3 rounded-xl bg-primary/5 px-4 py-3 ring-1 ring-primary/15">
          <span className="relative flex size-2.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full motion-reduce:animate-none bg-primary/60" />
            <span className="relative inline-flex size-2.5 rounded-full bg-primary" />
          </span>
          <p className="flex-1 text-base font-semibold">
            <span className="inline-block">
              {TRACE_LABEL_COPY[newest.label]}
              {newest.count > 1 && (
                <>
                  {" "}
                  <Count value={newest.count} />
                </>
              )}
            </span>
            <Time>{traceAgo(newest.endedAt, now)}</Time>
          </p>
          {candidateFindings !== null && <p className="text-xs tabular-nums text-muted-foreground/70">{candidateFindings} candidates</p>}
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
            <motion.li
              key={group.title ?? "scan"}
              layout={reduce ? false : "position"}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.25, ease: EASE_OUT }}
              className="relative pb-2 last:pb-0"
            >
              {!last && <span aria-hidden="true" className="absolute bottom-0 left-[0.71875rem] top-7 w-px bg-foreground/20" />}
              <Collapsible defaultOpen={current}>
                <CollapsibleTrigger className="group flex min-h-8 w-full items-center gap-3 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  <span
                    className={cn(
                      "z-10 grid size-6 shrink-0 place-items-center rounded-full border bg-background",
                      current ? "border-primary text-primary" : "border-foreground/20 bg-muted text-muted-foreground",
                    )}
                  >
                    {current ? <span className="size-2 rounded-full bg-primary" /> : <Check aria-hidden="true" className="size-3.5" />}
                  </span>
                  <span className="text-sm font-semibold">
                    {group.title}
                    <Time>{traceSpan(summary.spentMs)}</Time>
                  </span>
                  <ChevronDown aria-hidden="true" className="ml-auto size-4 shrink-0 text-muted-foreground transition-transform group-data-[panel-open]:rotate-180" />
                </CollapsibleTrigger>
                <CollapsiblePanel>
                  <ul className="ml-[2.375rem] pb-2 pt-0.5">
                    {leaves.map((entry, leaf) => {
                      const Icon = LABEL_ICON[entry.label];
                      return (
                        <Branch key={entry.id} last={leaf === leaves.length - 1 && earlier === 0}>
                          <Icon aria-hidden="true" className="size-3.5 text-muted-foreground" />
                          <span>{TRACE_LABEL_COPY[entry.label]}</span>
                          {entry.count > 1 && <Count value={entry.count} />}
                          <Time>{traceAgo(entry.endedAt, now)}</Time>
                        </Branch>
                      );
                    })}
                    {earlier > 0 && (
                      <Branch key="earlier" last>
                        <span className="text-xs tabular-nums text-muted-foreground/70">{earlier} earlier</span>
                      </Branch>
                    )}
                    {tally.map(({ label, count }, leaf) => {
                      const Icon = LABEL_ICON[label];
                      return (
                        <Branch key={label} last={leaf === tally.length - 1}>
                          <Icon aria-hidden="true" className="size-3.5 text-muted-foreground" />
                          <span>{TRACE_LABEL_COPY[label]}</span>
                          <Count value={count} />
                        </Branch>
                      );
                    })}
                  </ul>
                </CollapsiblePanel>
              </Collapsible>
            </motion.li>
          );
        })}
      </ol>
    </div>
  );
}
