import type { ReactNode } from "react";
import { Card } from "#/components/ui/card";
import { Progress } from "#/components/ui/progress";
import type { ScanStatus } from "../schemas";
import { scanPlural } from "../utils";
import { ScanNewDialog } from "./scan-new-dialog";
import { ScanRepoLink } from "./scan-repo-link";
import { ScanStatusBadge } from "./scan-status-badge";
import { ScanTime } from "./scan-time";

type ColumnProps = { label: string; footer?: ReactNode; children: ReactNode };

function Column({ label, footer, children }: ColumnProps) {
  return (
    <section aria-label={label} className="grid grid-rows-[auto_1fr_auto] gap-4 p-6">
      <h2 className="text-sm font-medium text-muted-foreground">{label}</h2>
      <div className="grid content-start gap-4">{children}</div>
      {footer}
    </section>
  );
}

function Count({ label, value }: { label: string; value: number }) {
  return (
    <li className="flex items-baseline justify-between gap-4">
      <span>{label}</span>
      <span className="font-semibold tabular-nums">{value}</span>
    </li>
  );
}

export function ScanListSummary({ scans }: { scans: readonly ScanStatus[] }) {
  const succeeded = scans.filter((scan) => scan.status === "succeeded").length;
  const failed = scans.filter((scan) => scan.status === "failed").length;
  const stopped = scans.filter((scan) => scan.status === "stopped").length;
  const active = scans.filter((scan) => scan.status === "queued" || scan.status === "running");
  const finished = succeeded + failed;
  const percent = finished > 0 ? Math.round((succeeded / finished) * 100) : 0;
  const latest = scans[0];

  return (
    <section aria-label="Scans summary">
      <Card className="grid overflow-hidden lg:grid-cols-3 lg:divide-x">
        <Column label="Scans" footer={<ScanNewDialog label="New scan" size="sm" variant="outline" />}>
          <p className="text-[40px] font-semibold leading-none tracking-tight tabular-nums">
            {scans.length}
            <span className="ml-1.5 text-sm font-normal tracking-normal text-muted-foreground">
              {scans.length === 1 ? "scan" : "scans"}
            </span>
          </p>
          <p className="max-w-copy text-sm leading-relaxed text-muted-foreground">
            {latest ? (
              <>
                The newest was <ScanTime value={latest.createdAt} />. Open one to read its report.
              </>
            ) : (
              "Run your first audit and its report will show up here."
            )}
          </p>
        </Column>

        <Column label="How they ended">
          <ul className="grid gap-3 text-sm leading-relaxed">
            <Count label="Succeeded" value={succeeded} />
            <Count label="Failed" value={failed} />
            <Count label="Stopped by a person" value={stopped} />
          </ul>
          <Progress
            value={percent}
            indicatorClassName="bg-primary/55"
            aria-label={`Success rate: ${succeeded} of ${finished} finished scans`}
          />
          <p className="max-w-copy text-sm leading-relaxed text-muted-foreground">
            {finished === 0
              ? "No scan has finished yet."
              : `${percent}% of the ${scanPlural(finished, "scan", "scans")} that finished succeeded. A stopped scan is not counted.`}
          </p>
        </Column>

        <Column label="Right now">
          <p className="text-[40px] font-semibold leading-none tracking-tight tabular-nums">
            {active.length}
            <span className="ml-1.5 text-sm font-normal tracking-normal text-muted-foreground">in progress</span>
          </p>
          {active.length === 0 ? (
            <p className="max-w-copy text-sm leading-relaxed text-muted-foreground">
              Nothing is running. A new scan starts as soon as a Runner is open.
            </p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {active.slice(0, 3).map((scan) => (
                <li key={scan.scanId} className="flex items-center justify-between gap-4 px-4 py-3">
                  <ScanRepoLink scanId={scan.scanId} repo={scan.repo} isPrivate={scan.isPrivate} />
                  <ScanStatusBadge status={scan.status} />
                </li>
              ))}
            </ul>
          )}
        </Column>
      </Card>
    </section>
  );
}
