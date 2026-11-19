import { useState } from "react";
import { ChevronUp, Info } from "lucide-react";
import { Alert, AlertDescription } from "#/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "#/components/ui/collapsible";
import { SCAN_STEP_COPY, TRACE_LABEL_COPY, TRACE_NO_PHASE_COPY, TRACE_PHASE_COPY, TRACE_QUIET_MS } from "../constants";
import { useNow, useScanTrace } from "../hooks";
import type { ScanStatus } from "../schemas";
import { groupTraceByPhase, scanPlural, traceAgo } from "../utils";

function TraceEntries({ scan, active }: { scan: ScanStatus; active: boolean }) {
  const { data, isPending, isError } = useScanTrace(scan.scanId, active);
  const entries = data?.entries ?? [];
  const candidateFindings = data?.candidateFindings ?? null;
  const loaded = !isPending;
  const failed = isError && !data;
  const now = useNow();
  const [mountedAt] = useState(() => Date.now());
  const newest = entries[0];
  const lastEventAt = newest ? new Date(newest.endedAt).getTime() : mountedAt;
  const quiet = active && now - lastEventAt >= TRACE_QUIET_MS;
  const currentPhase = newest?.phase ? TRACE_PHASE_COPY[newest.phase] : null;
  const step = scan.step ? SCAN_STEP_COPY[scan.step] : null;

  if (entries.length === 0) {
    return (
      <div className="grid gap-2 text-sm text-muted-foreground">
        {!loaded && <p>Loading the trace.</p>}
        {loaded && failed && <p>The trace could not be loaded. It tries again by itself while the scan runs.</p>}
        {loaded && !failed && active && step && <p>{step.label}. Nothing more detailed yet.</p>}
        {loaded && !failed && !active && step && <p>Last step: {step.label}.</p>}
        {loaded && !failed && (
          <p>{scan.runner ? "Live detail needs a newer Runner." : "No live detail was recorded for this scan."}</p>
        )}
        {quiet && <p>Nothing new has arrived for a few minutes. The scan is still running; some steps take a while.</p>}
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-sm text-muted-foreground">
        {active && currentPhase && <span>Current phase: <span className="font-medium text-foreground">{currentPhase}</span></span>}
        {candidateFindings !== null && <span>Candidate findings: <span className="font-medium text-foreground tabular-nums">{candidateFindings}</span></span>}
        {active && <span className="tabular-nums">Last event {traceAgo(newest.endedAt, now)}</span>}
        <span>{scanPlural(entries.length, "entry", "entries")}</span>
      </div>
      {quiet && (
        <Alert variant="info">
          <Info />
          <AlertDescription>Nothing new has arrived for a few minutes. The scan is still running; some steps take a while.</AlertDescription>
        </Alert>
      )}
      <div className="max-h-96 overflow-auto">
        {groupTraceByPhase(entries).map((group) => (
          <section key={group.key} className="grid gap-1 pb-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group.title ?? TRACE_NO_PHASE_COPY}</h3>
            <ul className="grid gap-1">
              {group.entries.map((entry) => (
                <li key={entry.id} className="flex items-baseline justify-between gap-3 text-sm">
                  <span>
                    {TRACE_LABEL_COPY[entry.label]}
                    {entry.count > 1 && <span className="text-muted-foreground tabular-nums"> x{entry.count}</span>}
                  </span>
                  <time dateTime={entry.endedAt} className="shrink-0 text-xs text-muted-foreground tabular-nums">
                    {traceAgo(entry.endedAt, now)}
                  </time>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}

// -----
// What the agent is doing, as labels only (never what it wrote). While the
// Scan runs it is open and updates by itself; once the Scan ended or failed
// it sits closed under the report.
// -----
export function ScanTrace({ scan }: { scan: ScanStatus }) {
  const active = scan.status === "queued" || scan.status === "running";
  const body = <TraceEntries scan={scan} active={active} />;

  if (active) {
    return (
      <Card>
        <CardHeader className="gap-1.5">
          <CardTitle>Trace</CardTitle>
          <p className="max-w-copy text-sm leading-relaxed text-muted-foreground">What the scan is doing now, newest first.</p>
        </CardHeader>
        <CardContent>{body}</CardContent>
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
          <p className="max-w-copy text-sm leading-relaxed text-muted-foreground">What the scan did, newest first.</p>
        </CardHeader>
        <CollapsiblePanel>
          <CardContent>{body}</CardContent>
        </CollapsiblePanel>
      </Collapsible>
    </Card>
  );
}
