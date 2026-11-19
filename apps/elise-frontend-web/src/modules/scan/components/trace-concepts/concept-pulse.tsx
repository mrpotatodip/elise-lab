import { RUNNER_JOB_PHASE_VALUES } from "@repo/contracts/elise";
import { cn } from "#/lib/utils";
import { TRACE_LABEL_COPY, TRACE_PHASE_COPY } from "../../constants";
import { summarizeTraceGroup, tracePhaseStates, traceAgo, traceSpan } from "../../utils";
import { LABEL_BAR, WORK_LABELS, isWork, tallyByLabel, type ConceptProps } from "./shared";

export function ConceptPulse({ entries, now, candidateFindings }: ConceptProps) {
  const newest = entries.find(isWork);
  const steps = tracePhaseStates(entries, true);
  const recent = entries.filter(isWork).slice(1, 4);
  const overall = tallyByLabel(entries);
  const currentPhase = steps.find((step) => step.state === "current");
  const currentEntries = entries.filter((entry) => entry.phase === currentPhase?.phase);
  return (
    <div className="grid gap-6">
      <div className="grid gap-1">
        <p className="text-xs uppercase tracking-wide text-muted-foreground">{currentPhase ? `${TRACE_PHASE_COPY[currentPhase.phase]} · ${traceSpan(summarizeTraceGroup(currentEntries).spentMs)} in` : "Starting"}</p>
        <p className="flex items-baseline gap-2 text-2xl font-semibold tracking-tight">
          {newest ? TRACE_LABEL_COPY[newest.label] : "Waiting"}
          <span aria-hidden="true" className="flex gap-1">
            {[0, 1, 2].map((dot) => (
              <span key={dot} className="size-1.5 animate-bounce rounded-full bg-primary" style={{ animationDelay: `${dot * 120}ms`, animationDuration: "900ms" }} />
            ))}
          </span>
          {newest && <span className="ml-auto text-sm font-normal text-muted-foreground tabular-nums">{traceAgo(newest.endedAt, now)}</span>}
        </p>
      </div>
      <ul className="grid gap-3">
        {RUNNER_JOB_PHASE_VALUES.map((phase) => {
          const state = steps.find((step) => step.phase === phase)?.state ?? "pending";
          const tally = tallyByLabel(entries.filter((entry) => entry.phase === phase));
          const total = tally.reduce((sum, item) => sum + item.count, 0);
          return (
            <li key={phase} className="grid grid-cols-[4.5rem_1fr_3rem] items-center gap-3">
              <span className={cn("text-sm", state === "pending" ? "text-muted-foreground" : "font-medium")}>{TRACE_PHASE_COPY[phase]}</span>
              <span className={cn("flex h-3 overflow-hidden rounded-full", state === "pending" ? "border border-dashed" : "bg-muted")}>
                {tally.map(({ label, count }) => (
                  <span key={label} className={cn("h-full", LABEL_BAR[label])} style={{ width: `${(count / total) * 100}%` }} />
                ))}
              </span>
              <span className="text-right text-xs text-muted-foreground tabular-nums">{state === "pending" ? "" : total}</span>
            </li>
          );
        })}
      </ul>
      <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground">
        {WORK_LABELS.map((label) => (
          <li key={label} className="flex items-center gap-1.5">
            <span className={cn("size-2 rounded-full", LABEL_BAR[label])} />
            {TRACE_LABEL_COPY[label]}
            <span className="font-medium text-foreground tabular-nums">{overall.find((item) => item.label === label)?.count ?? 0}</span>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-2 border-t pt-4 text-xs text-muted-foreground">
        <span>Just before</span>
        {recent.map((entry) => (
          <span key={entry.id} className="rounded-full bg-muted px-2.5 py-1 tabular-nums">
            {TRACE_LABEL_COPY[entry.label]} · {traceAgo(entry.endedAt, now)}
          </span>
        ))}
        {candidateFindings !== null && <span className="ml-auto">{candidateFindings} candidate findings</span>}
      </div>
    </div>
  );
}
