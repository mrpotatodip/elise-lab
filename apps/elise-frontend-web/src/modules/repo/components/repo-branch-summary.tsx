import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Badge } from "#/components/ui/badge";
import { Card } from "#/components/ui/card";
import { ScanSeverityDots, ScanStatusBadge, ScanTime, type ScanStatus } from "#/modules/scan";
import type { RepoBranch } from "../schemas";

type ColumnProps = { label: string; children: ReactNode };

function Column({ label, children }: ColumnProps) {
  return (
    <section aria-label={label} className="grid content-start gap-4 p-6">
      <h2 className="text-sm font-medium text-muted-foreground">{label}</h2>
      {children}
    </section>
  );
}

function Line({ label, value }: { label: string; value: number }) {
  return (
    <li className="flex items-baseline justify-between gap-4">
      <span>{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </li>
  );
}

type RepoBranchSummaryProps = { open: RepoBranch["open"]; verdict: ReactNode; scans: readonly ScanStatus[] };

export function RepoBranchSummary({ open, verdict, scans }: RepoBranchSummaryProps) {
  const notRated = open.total - Object.values(open.severity).reduce((sum, count) => sum + count, 0);
  const confirmed = open.total - open.needsValidation;

  return (
    <section aria-label="Summary of this branch">
      <Card className="grid overflow-hidden lg:grid-cols-3 lg:divide-x">
        {verdict}

        <Column label="What is open">
          <p className="text-[40px] font-semibold leading-none tracking-tight tabular-nums">
            {open.total}
            <span className="ml-1.5 text-sm font-normal tracking-normal text-muted-foreground">
              {open.total === 1 ? "problem" : "problems"}
            </span>
          </p>
          {open.total === 0 ? (
            <p className="max-w-copy text-sm leading-relaxed text-muted-foreground">Nothing is open on this branch.</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <ScanSeverityDots counts={open.severity} />
                {notRated > 0 && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <span aria-hidden="true" className="size-1.5 rounded-full border border-muted-foreground" />
                    <span className="tabular-nums">{notRated}</span> not rated
                  </span>
                )}
              </div>
              <ul className="grid gap-3 text-sm leading-relaxed">
                <Line label="Confirmed by a scan" value={confirmed} />
                <Line label="Needs a person to check" value={open.needsValidation} />
                <Line label="Came back after a fix" value={open.regressed} />
                <Line label="Not in the latest full scan" value={open.unchecked} />
              </ul>
            </>
          )}
        </Column>

        <Column label="Latest scans">
          {scans.length === 0 ? (
            <p className="max-w-copy text-sm leading-relaxed text-muted-foreground">No scan of this branch yet.</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {scans.slice(0, 3).map((scan) => (
                <li key={scan.scanId}>
                  <Link
                    to="/scans/$scanId"
                    params={{ scanId: scan.scanId }}
                    className="flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                  >
                    <span className="grid gap-0.5 text-sm">
                      <ScanTime value={scan.createdAt} />
                      <span className="text-xs text-muted-foreground">
                        {scan.commitSha ? `Commit ${scan.commitSha.slice(0, 7)}` : "Commit not read"}
                      </span>
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      {scan.summary && scan.summary.total > 0 && (
                        <Badge variant="outline">{scan.summary.total} found</Badge>
                      )}
                      <ScanStatusBadge status={scan.status} />
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Column>
      </Card>
    </section>
  );
}
