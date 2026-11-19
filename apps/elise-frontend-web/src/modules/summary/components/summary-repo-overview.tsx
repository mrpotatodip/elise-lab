import type { ReactNode } from "react";
import { Card } from "#/components/ui/card";
import { repoTotals, type Repo } from "#/modules/repo";
import { ScanSeverityDots } from "#/modules/scan";
import { SUMMARY_COPY } from "../constants";

type ColumnProps = { label: string; children: ReactNode };

function Column({ label, children }: ColumnProps) {
  return (
    <section aria-label={label} className="grid content-start gap-4 p-6">
      <h2 className="text-sm font-medium text-muted-foreground">{label}</h2>
      {children}
    </section>
  );
}

function Step({ n, children }: { n: number; children: ReactNode }) {
  return (
    <li className="grid grid-cols-[1.5rem_1fr] gap-2">
      <span aria-hidden="true" className="tabular-nums text-muted-foreground">
        {n}
      </span>
      <span>{children}</span>
    </li>
  );
}

export function SummaryRepoOverview({ repo }: { repo: Repo }) {
  const totals = repoTotals([repo]);
  const notRated = totals.total - Object.values(totals.severity).reduce((sum, count) => sum + count, 0);
  const confirmed = totals.total - totals.needsValidation;

  return (
    <section aria-label="Summary of this repository">
      <Card className="grid overflow-hidden lg:grid-cols-3 lg:divide-x">
        <Column label="What is open">
          <p className="text-[40px] font-semibold leading-none tracking-tight tabular-nums">
            {totals.total}
            <span className="ml-1.5 text-sm font-normal tracking-normal text-muted-foreground">{totals.total === 1 ? "problem" : "problems"}</span>
          </p>
          {totals.total === 0 ? (
            <p className="max-w-copy text-sm leading-relaxed text-muted-foreground">{SUMMARY_COPY.nothingOpen}</p>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <ScanSeverityDots counts={totals.severity} />
                {notRated > 0 && (
                  <span className="flex items-center gap-1 text-xs text-muted-foreground">
                    <span aria-hidden="true" className="size-1.5 rounded-full border border-muted-foreground" />
                    <span className="tabular-nums">{notRated}</span> not rated
                  </span>
                )}
              </div>
              <p className="max-w-copy text-sm leading-relaxed text-muted-foreground">Medium and Low say how serious a problem is. A problem with no rating still needs a person to look at it.</p>
            </>
          )}
        </Column>

        <Column label="How sure we are">
          <ul className="grid gap-3 text-sm leading-relaxed">
            <li className="flex items-baseline justify-between gap-4">
              <span>Confirmed by the scan</span>
              <span className="font-semibold tabular-nums">{confirmed}</span>
            </li>
            <li className="flex items-baseline justify-between gap-4">
              <span>Needs a person to check by hand</span>
              <span className="font-semibold tabular-nums">{totals.needsValidation}</span>
            </li>
            <li className="flex items-baseline justify-between gap-4">
              <span>Came back after a fix</span>
              <span className="font-semibold tabular-nums">{totals.regressed}</span>
            </li>
            <li className="flex items-baseline justify-between gap-4">
              <span>Not in the latest full scan</span>
              <span className="font-semibold tabular-nums">{totals.unchecked}</span>
            </li>
          </ul>
          <p className="max-w-copy text-sm leading-relaxed text-muted-foreground">{SUMMARY_COPY.findingsLegend}</p>
        </Column>

        <Column label="What to do">
          <ol className="grid gap-3 text-sm leading-relaxed">
            <Step n={1}>Send this page to the developer who owns the repository.</Step>
            <Step n={2}>Fix the confirmed problems first, then check the rest by hand.</Step>
            <Step n={3}>Run a scan again to confirm a fix. Marking a problem fixed does not do that.</Step>
          </ol>
          <p className="max-w-copy text-sm leading-relaxed text-muted-foreground">{SUMMARY_COPY.findingsPrivate}</p>
        </Column>
      </Card>
    </section>
  );
}
