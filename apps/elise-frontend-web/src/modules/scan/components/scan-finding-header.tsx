import type { ReactNode } from "react";
import { Badge } from "#/components/ui/badge";
import { SheetDescription, SheetTitle } from "#/components/ui/sheet";
import { SCAN_FINDING_STATE_COPY } from "../constants";
import type { Finding } from "../schemas";
import { ScanSeverityBadge } from "./scan-severity-badge";

type ScanFindingHeaderProps = {
  finding: Finding;
  aside?: ReactNode;
  badges?: ReactNode;
  titlePrefix?: string;
  showImpact?: boolean;
};

// -----
// What a finding's side panel says first: how severe it is, whether a scan
// confirmed it, its title and where it is. Every panel about a finding
// opens with this, so the reader sees the same finding in each one.
// badges adds more (the decision), aside sits at the right end (the
// position in a list), titlePrefix is read out before the title and not
// shown, and showImpact adds a short summary of what could happen.
// -----
export function ScanFindingHeader({ finding, aside, badges, titlePrefix, showImpact = false }: ScanFindingHeaderProps) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <ScanSeverityBadge severity={finding.severity} />
        <Badge
          variant={
            finding.state === "confirmed" ? "success" : finding.state === "needs_validation" ? "warning" : "neutral"
          }
        >
          {SCAN_FINDING_STATE_COPY[finding.state].label}
        </Badge>
        {badges}
        {aside && <span className="ml-auto text-xs tabular-nums text-muted-foreground">{aside}</span>}
      </div>
      <SheetTitle>
        {titlePrefix && <span className="sr-only">{titlePrefix}</span>}
        {finding.title}
      </SheetTitle>
      <SheetDescription render={<div />}>
        {finding.place ? (
          <span className="font-mono text-xs [overflow-wrap:anywhere]">{`${finding.place.file}:${finding.place.line}`}</span>
        ) : (
          "No file was recorded for this finding."
        )}
        {finding.state !== "confirmed" && (
          <span className="mt-2 block">{SCAN_FINDING_STATE_COPY[finding.state].note}</span>
        )}
        {showImpact && finding.detail?.impact && <span className="mt-2 line-clamp-3">{finding.detail.impact}</span>}
      </SheetDescription>
    </>
  );
}
