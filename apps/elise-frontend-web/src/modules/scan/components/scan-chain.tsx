import { Link } from "@tanstack/react-router";
import { cn } from "#/lib/utils";
import type { ScanStatus } from "../schemas";

const LINK =
  "rounded-sm font-mono underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function ScanChain({
  scan,
  className = "text-sm",
}: {
  scan: Pick<ScanStatus, "resumesScanId" | "resumedByScanId">;
  className?: string;
}) {
  if (!scan.resumesScanId && !scan.resumedByScanId) return null;
  return (
    <span className={cn("relative flex flex-wrap items-center gap-x-3 gap-y-1 text-muted-foreground", className)}>
      {scan.resumesScanId && (
        <span>
          Resumes Scan{" "}
          <Link to="/scans/$scanId" params={{ scanId: scan.resumesScanId }} className={LINK}>
            {scan.resumesScanId.slice(0, 8)}
          </Link>
        </span>
      )}
      {scan.resumedByScanId && (
        <span>
          Resumed as Scan{" "}
          <Link to="/scans/$scanId" params={{ scanId: scan.resumedByScanId }} className={LINK}>
            {scan.resumedByScanId.slice(0, 8)}
          </Link>
        </span>
      )}
    </span>
  );
}
