import { useState, type ReactNode } from "react";
import { Check, ChevronDown, ChevronUp, Info, X } from "lucide-react";
import { motion, useReducedMotion } from "motion/react";
import { Alert, AlertDescription } from "#/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "#/components/ui/collapsible";
import { cn } from "#/lib/utils";
import { SCAN_STEP_COPY, TRACE_LABEL_COPY, TRACE_NO_PHASE_COPY, TRACE_QUIET_MS, TRACE_VISIBLE_ENTRIES } from "../constants";
import { useNow, useScanTrace } from "../hooks";
import type { ScanStatus, TraceEntry } from "../schemas";
import { groupTraceByPhase, isTraceWork, summarizeTraceGroup, tallyTraceLabels, traceAgo, traceSpan, type TracePhaseGroup } from "../utils";
import { TRACE_LABEL_ICON } from "./scan-trace-icons";

const EASE_OUT = [0.23, 1, 0.32, 1] as const;

function Count({ value }: { value: number }) {
  return <span className="font-normal tabular-nums text-muted-foreground/70">×{value}</span>;
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

type PhaseNodeProps = { group: TracePhaseGroup; now: number; last: boolean; running: boolean; stopped: boolean };

function PhaseNode({ group, now, last, running, stopped }: PhaseNodeProps) {
  const reduce = useReducedMotion();
  const [picked, setPicked] = useState<boolean | null>(null);
  const work = group.entries.filter(isTraceWork);
  const recent = running || stopped;
  const leaves = recent ? work.slice(0, TRACE_VISIBLE_ENTRIES) : [];
  const earlier = recent ? work.length - leaves.length : 0;
  const tally = recent ? [] : tallyTraceLabels(work);

  return (
    <motion.li
      layout={reduce ? false : "position"}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25, ease: EASE_OUT }}
      className="relative pb-2 last:pb-0"
    >
      {!last && <span aria-hidden="true" className="absolute bottom-0 left-[0.71875rem] top-7 w-px bg-foreground/20" />}
      <Collapsible open={picked ?? recent} onOpenChange={setPicked}>
        <CollapsibleTrigger className="group flex min-h-8 w-full items-center gap-3 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <span
            className={cn(
              "z-10 grid size-6 shrink-0 place-items-center rounded-full border bg-background",
              running && "border-primary text-primary",
              stopped && "border-status-danger text-status-danger",
              !running && !stopped && "border-foreground/20 bg-muted text-muted-foreground",
            )}
          >
            {running && <span className="size-2 rounded-full bg-primary" />}
            {stopped && <X aria-hidden="true" className="size-3.5" />}
            {!running && !stopped && <Check aria-hidden="true" className="size-3.5" />}
          </span>
          <span className="text-sm font-semibold">
            {group.title ?? TRACE_NO_PHASE_COPY}
            <Time>{traceSpan(summarizeTraceGroup(group.entries).spentMs)}</Time>
            {stopped && <span className="ml-2 text-xs font-normal text-status-danger">Stopped here</span>}
          </span>
          <ChevronDown aria-hidden="true" className="ml-auto size-4 shrink-0 text-muted-foreground transition-transform group-data-[panel-open]:rotate-180" />
        </CollapsibleTrigger>
        <CollapsiblePanel>
          <ul className="ml-[2.375rem] pb-2 pt-0.5">
            {leaves.map((entry, leaf) => {
              const Icon = TRACE_LABEL_ICON[entry.label];
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
              const Icon = TRACE_LABEL_ICON[label];
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
}

export type TraceViewProps = {
  entries: TraceEntry[];
  candidateFindings: number | null;
  now: number;
  active: boolean;
  failed: boolean;
  quiet: boolean;
  empty: ReactNode;
};

// -----
// The Trace as a person reads it: what the agent is doing now, then a tree
// with one branch point per Phase. The running Phase is open with its last
// few actions; a finished Phase closes by itself and shows how often each
// kind of action ran; a failed Scan marks the Phase it stopped in. It takes
// plain props so a preview page can feed it made-up data.
// -----
export function TraceView({ entries, candidateFindings, now, active, failed, quiet, empty }: TraceViewProps) {
  const newest = entries.find(isTraceWork) ?? entries[0];
  if (!newest) return <div className="grid gap-2 text-sm text-muted-foreground">{empty}</div>;
  const groups = groupTraceByPhase(entries);

  return (
    <div className="grid gap-5">
      {active && (
        <div className="flex items-center gap-3 rounded-xl bg-primary/5 px-4 py-3 ring-1 ring-primary/15">
          <span className="relative flex size-2.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary/60 motion-reduce:animate-none" />
            <span className="relative inline-flex size-2.5 rounded-full bg-primary" />
          </span>
          <p className="flex-1 text-base font-semibold">
            {TRACE_LABEL_COPY[newest.label]}
            {newest.count > 1 && (
              <>
                {" "}
                <Count value={newest.count} />
              </>
            )}
            <Time>{traceAgo(newest.endedAt, now)}</Time>
          </p>
          {candidateFindings !== null && <p className="text-xs tabular-nums text-muted-foreground/70">{candidateFindings} candidates</p>}
        </div>
      )}
      {quiet && (
        <Alert variant="info">
          <Info />
          <AlertDescription>Nothing new has arrived for a few minutes. The scan is still running; some steps take a while.</AlertDescription>
        </Alert>
      )}
      <ol>
        {groups.map((group, index) => (
          <PhaseNode
            key={group.title ?? "scan"}
            group={group}
            now={now}
            last={index === groups.length - 1}
            running={active && index === 0}
            stopped={failed && index === 0}
          />
        ))}
      </ol>
    </div>
  );
}

function TraceEntries({ scan, active }: { scan: ScanStatus; active: boolean }) {
  const { data, isPending, isError } = useScanTrace(scan.scanId, active);
  const entries = data?.entries ?? [];
  const loaded = !isPending;
  const loadFailed = isError && !data;
  const browserNow = useNow();
  const [mountedAt] = useState(() => Date.now());
  const quiet = active && browserNow - (data?.changedAt ?? mountedAt) >= TRACE_QUIET_MS;
  const step = scan.step ? SCAN_STEP_COPY[scan.step] : null;

  const empty = (
    <>
      {!loaded && <p>Loading the trace.</p>}
      {loaded && loadFailed && <p>The trace could not be loaded. It tries again by itself while the scan runs.</p>}
      {loaded && !loadFailed && active && step && <p>{step.label}. Nothing more detailed yet.</p>}
      {loaded && !loadFailed && !active && step && <p>Last step: {step.label}.</p>}
      {loaded && !loadFailed && active && <p>Waiting for the first entries.</p>}
      {loaded && !loadFailed && !active && <p>{scan.runner ? "Live detail needs a newer Runner." : "No live detail was recorded for this scan."}</p>}
      {quiet && <p>Nothing new has arrived for a few minutes. The scan is still running; some steps take a while.</p>}
    </>
  );

  return (
    <TraceView
      entries={entries}
      candidateFindings={data?.candidateFindings ?? null}
      now={browserNow + (data?.offsetMs ?? 0)}
      active={active}
      failed={scan.status === "failed"}
      quiet={quiet}
      empty={empty}
    />
  );
}

// -----
// The Card around the Trace. Open while the Scan runs; once it ended or
// failed it sits closed under the report.
// -----
export function TraceShell({ active, children }: { active: boolean; children: ReactNode }) {
  if (active) {
    return (
      <Card>
        <CardHeader className="gap-1.5">
          <CardTitle>Trace</CardTitle>
          <p className="max-w-copy text-sm leading-relaxed text-muted-foreground">What the scan is doing now.</p>
        </CardHeader>
        <CardContent>{children}</CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <Collapsible>
        <CardHeader className="gap-1.5">
          <CardTitle>
            <CollapsibleTrigger className="group flex min-h-8 w-full items-center justify-between gap-3 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              Trace
              <ChevronUp aria-hidden="true" className="size-4 shrink-0 rotate-180 text-muted-foreground transition-transform group-data-[panel-open]:rotate-0" />
            </CollapsibleTrigger>
          </CardTitle>
          <p className="max-w-copy text-sm leading-relaxed text-muted-foreground">What the scan did, by phase.</p>
        </CardHeader>
        <CollapsiblePanel>
          <CardContent>{children}</CardContent>
        </CollapsiblePanel>
      </Collapsible>
    </Card>
  );
}

export function ScanTrace({ scan }: { scan: ScanStatus }) {
  const active = scan.status === "queued" || scan.status === "running";
  return (
    <TraceShell active={active}>
      <TraceEntries scan={scan} active={active} />
    </TraceShell>
  );
}
