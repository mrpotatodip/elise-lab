import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card } from "#/components/ui/card";
import { scanDiffQuery } from "../hooks";
import { SEVERITIES, type ScanStatus } from "../schemas";
import { scanCost, scanDuration, scanPlural, scanTokens } from "../utils";
import { ScanSeverityDots } from "./scan-severity-dots";

type ColumnProps = { label: string; children: ReactNode };

function Column({ label, children }: ColumnProps) {
  return (
    <section aria-label={label} className="grid content-start gap-4 p-6">
      <h2 className="text-sm font-medium text-muted-foreground">{label}</h2>
      {children}
    </section>
  );
}

function Line({ label, value }: { label: string; value: ReactNode }) {
  return (
    <li className="flex items-baseline justify-between gap-4">
      <span>{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </li>
  );
}

// -----
// The same card as Team and Plan: three columns, each with one lead number and
// a few plain lines. The cost column is there only when usage was recorded.
// -----
export function ScanSummary({ scan }: { scan: ScanStatus }) {
  const { summary, usage } = scan;
  const comparable = Boolean(scan.branchId) && scan.skill === "lite";
  const { data: diff } = useQuery({ ...scanDiffQuery(scan.scanId), enabled: comparable && Boolean(summary) });
  if (!summary && !usage) return null;

  const hasSeverity = summary ? SEVERITIES.some((s) => summary.severity[s] > 0) : false;
  const duration = scanDuration(usage?.durationMs);
  const tokens = usage ? usage.inputTokens + usage.outputTokens + usage.cacheReadTokens + usage.cacheWriteTokens : 0;

  return (
    <section aria-label="Scan summary">
      <Card className="grid overflow-hidden lg:grid-cols-3 lg:divide-x">
        {summary && (
          <Column label="What it found">
            <p className="text-[40px] font-semibold leading-none tracking-tight tabular-nums">
              {summary.total}
              <span className="ml-1.5 text-sm font-normal tracking-normal text-muted-foreground">
                {summary.total === 1 ? "finding" : "findings"}
              </span>
            </p>
            {hasSeverity && <ScanSeverityDots counts={summary.severity} />}
            <ul className="grid gap-3 text-sm leading-relaxed">
              <Line label="Confirmed by the scan" value={summary.total - summary.needsValidation} />
              <Line label="Needs a person to check by hand" value={summary.needsValidation} />
            </ul>
            <p className="max-w-copy text-sm leading-relaxed text-muted-foreground">
              {summary.total === 0
                ? "Nothing was reported. That does not prove the code is safe."
                : summary.needsValidation > 0
                  ? `${scanPlural(summary.needsValidation, "finding is", "findings are")} likely but unverified. Check by hand before acting.`
                  : "Every finding was verified."}
            </p>
          </Column>
        )}

        {summary && (
          <Column label="Compared with earlier scans">
            {comparable && (diff === undefined || diff.previousScanId !== null) ? (
              <>
                <p className="text-[40px] font-semibold leading-none tracking-tight tabular-nums">
                  {diff === undefined ? "-" : summary.new}
                  <span className="ml-1.5 text-sm font-normal tracking-normal text-muted-foreground">new</span>
                </p>
                <p className="max-w-copy text-sm leading-relaxed text-muted-foreground">
                  {diff === undefined
                    ? "Comparing with the last scan…"
                    : `${summary.carried} carried over from earlier scans and seen again. The rest of this page shows what changed.`}
                </p>
              </>
            ) : (
              <>
                <p className="text-[40px] font-semibold leading-none tracking-tight">None</p>
                <p className="max-w-copy text-sm leading-relaxed text-muted-foreground">
                  {scan.branchId
                    ? "This is the first scan of this branch, so there is nothing to compare with yet."
                    : "A one-off scan has no history to compare with."}
                </p>
              </>
            )}
          </Column>
        )}

        {usage && (
          <Column label={scan.runner ? "What it would cost" : "What it cost"}>
            <p className="text-[40px] font-semibold leading-none tracking-tight tabular-nums">
              {scanCost(usage.costUsd)}
            </p>
            <ul className="grid gap-3 text-sm leading-relaxed">
              {duration && <Line label="Took" value={duration} />}
              {tokens > 0 && <Line label="Tokens" value={scanTokens(tokens)} />}
              {usage.turns !== null && <Line label="Turns" value={usage.turns} />}
            </ul>
            <p className="max-w-copy text-sm leading-relaxed text-muted-foreground">
              Estimated at list price.{scan.runner ? ` It ran on ${scan.runner.name}, so nothing was billed.` : ""}
            </p>
          </Column>
        )}
      </Card>
    </section>
  );
}
