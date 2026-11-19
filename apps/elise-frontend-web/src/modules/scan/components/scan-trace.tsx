import { useState, type ReactNode } from "react";
import { Check, ChevronUp, Info } from "lucide-react";
import { Alert, AlertDescription } from "#/components/ui/alert";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "#/components/ui/collapsible";
import { cn } from "#/lib/utils";
import { SCAN_STEP_COPY, TRACE_LABEL_COPY, TRACE_NO_PHASE_COPY, TRACE_PHASE_COPY, TRACE_QUIET_MS, TRACE_VISIBLE_ENTRIES } from "../constants";
import { useNow, useScanTrace } from "../hooks";
import type { ScanStatus, TraceEntry } from "../schemas";
import { groupTraceByPhase, scanPlural, summarizeTraceGroup, tracePhaseStates, traceAgo, traceSpan, type TracePhaseGroup } from "../utils";

const isMarker = (entry: TraceEntry) => entry.label === "phase_started" || entry.label === "phase_ended";

function EntryLabel({ entry }: { entry: TraceEntry }) {
  return (
    <>
      {TRACE_LABEL_COPY[entry.label]}
      {entry.count > 1 && <span className="text-muted-foreground tabular-nums"> ×{entry.count}</span>}
    </>
  );
}

function PhaseSteps({ entries, active }: { entries: TraceEntry[]; active: boolean }) {
  return (
    <ol className="flex flex-wrap items-center gap-2" aria-label="Phases">
      {tracePhaseStates(entries, active).map(({ phase, state }) => (
        <li
          key={phase}
          aria-current={state === "current" ? "step" : undefined}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium",
            state === "current" && "border-primary bg-primary/10 text-foreground",
            state === "done" && "text-foreground",
            state === "pending" && "border-dashed text-muted-foreground",
          )}
        >
          {state === "done" && <Check aria-hidden="true" className="size-3" />}
          {state === "current" && <span aria-hidden="true" className="size-2 animate-pulse rounded-full bg-primary" />}
          {TRACE_PHASE_COPY[phase]}
        </li>
      ))}
    </ol>
  );
}

function NowDoing({ entry, now }: { entry: TraceEntry; now: number }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-lg border bg-muted/40 px-4 py-3">
      <div>
        <p className="text-xs uppercase tracking-wide text-muted-foreground">Doing now</p>
        <p className="text-lg font-semibold">
          <EntryLabel entry={entry} />
        </p>
      </div>
      <p className="text-sm text-muted-foreground tabular-nums">Last event {traceAgo(entry.endedAt, now)}</p>
    </div>
  );
}

function PhaseGroup({ group, now, openByDefault }: { group: TracePhaseGroup; now: number; openByDefault: boolean }) {
  const [showAll, setShowAll] = useState(false);
  const rows = group.entries.filter((entry) => !isMarker(entry));
  const shown = showAll ? rows : rows.slice(0, TRACE_VISIBLE_ENTRIES);
  const summary = summarizeTraceGroup(group.entries);
  return (
    <Collapsible defaultOpen={openByDefault} className="rounded-lg border">
      <CollapsibleTrigger className="group flex min-h-11 w-full items-center justify-between gap-3 rounded-lg px-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span className="text-sm font-semibold">{group.title ?? TRACE_NO_PHASE_COPY}</span>
        <span className="flex items-center gap-3 text-xs text-muted-foreground tabular-nums">
          {scanPlural(rows.length, "entry", "entries")} · {traceSpan(summary.spentMs)}
          <ChevronUp aria-hidden="true" className="size-4 rotate-180 transition-transform group-data-[panel-open]:rotate-0" />
        </span>
      </CollapsibleTrigger>
      <CollapsiblePanel>
        <ul className="grid gap-1 border-t px-4 py-3">
          {shown.map((entry) => (
            <li key={entry.id} className="flex items-baseline justify-between gap-3 text-sm">
              <span>
                <EntryLabel entry={entry} />
              </span>
              <time dateTime={entry.endedAt} className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {traceAgo(entry.endedAt, now)}
              </time>
            </li>
          ))}
          {rows.length > TRACE_VISIBLE_ENTRIES && (
            <li>
              <Button variant="ghost" size="sm" className="-ml-2.5" onClick={() => setShowAll(!showAll)}>
                {showAll ? "Show fewer" : `Show all ${rows.length}`}
              </Button>
            </li>
          )}
        </ul>
      </CollapsiblePanel>
    </Collapsible>
  );
}

export type TraceViewProps = {
  entries: TraceEntry[];
  candidateFindings: number | null;
  now: number;
  active: boolean;
  quiet: boolean;
  empty: ReactNode;
};

// -----
// The Trace as a person reads it: where the Scan is among its Phases, what
// it is doing right now, and each Phase as a block that opens to its latest
// entries. It takes plain props so /dev/trace can show it on made-up data.
// -----
export function TraceView({ entries, candidateFindings, now, active, quiet, empty }: TraceViewProps) {
  const newest = entries.find((entry) => !isMarker(entry)) ?? entries[0];
  if (!newest) return <div className="grid gap-2 text-sm text-muted-foreground">{empty}</div>;

  return (
    <div className="grid gap-4">
      <PhaseSteps entries={entries} active={active} />
      {active && <NowDoing entry={newest} now={now} />}
      <p className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
        {candidateFindings !== null && (
          <span>
            Candidate findings: <span className="font-medium text-foreground tabular-nums">{candidateFindings}</span>
          </span>
        )}
        <span>{scanPlural(entries.filter((entry) => !isMarker(entry)).length, "entry", "entries")}</span>
      </p>
      {quiet && (
        <Alert variant="info">
          <Info />
          <AlertDescription>Nothing new has arrived for a few minutes. The scan is still running; some steps take a while.</AlertDescription>
        </Alert>
      )}
      <div className="grid gap-2">
        {groupTraceByPhase(entries).map((group, index) => (
          <PhaseGroup key={group.key} group={group} now={now} openByDefault={active && index === 0} />
        ))}
      </div>
    </div>
  );
}

function TraceEntries({ scan, active }: { scan: ScanStatus; active: boolean }) {
  const { data, isPending, isError } = useScanTrace(scan.scanId, active);
  const entries = data?.entries ?? [];
  const loaded = !isPending;
  const failed = isError && !data;
  const browserNow = useNow();
  const [mountedAt] = useState(() => Date.now());
  const quiet = active && browserNow - (data?.changedAt ?? mountedAt) >= TRACE_QUIET_MS;
  const step = scan.step ? SCAN_STEP_COPY[scan.step] : null;

  const empty = (
    <>
      {!loaded && <p>Loading the trace.</p>}
      {loaded && failed && <p>The trace could not be loaded. It tries again by itself while the scan runs.</p>}
      {loaded && !failed && active && step && <p>{step.label}. Nothing more detailed yet.</p>}
      {loaded && !failed && !active && step && <p>Last step: {step.label}.</p>}
      {loaded && !failed && active && <p>Waiting for the first entries.</p>}
      {loaded && !failed && !active && <p>{scan.runner ? "Live detail needs a newer Runner." : "No live detail was recorded for this scan."}</p>}
      {quiet && <p>Nothing new has arrived for a few minutes. The scan is still running; some steps take a while.</p>}
    </>
  );

  return <TraceView entries={entries} candidateFindings={data?.candidateFindings ?? null} now={browserNow + (data?.offsetMs ?? 0)} active={active} quiet={quiet} empty={empty} />;
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
