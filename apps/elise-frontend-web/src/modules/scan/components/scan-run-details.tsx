import type { ReactNode } from "react";
import { ChevronUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "#/components/ui/collapsible";
import { SCAN_EFFORT_OPTIONS, SCAN_MODEL_NAMES, SCAN_PROFILE_OPTIONS, SCAN_SKILL_OPTIONS } from "../constants";
import type { ScanStatus } from "../schemas";
import { scanDuration } from "../utils";
import { ScanTime } from "./scan-time";

const labelOf = <T extends string>(options: readonly { value: T; label: string }[], value: T) => options.find((o) => o.value === value)?.label ?? value;

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium">{children}</dd>
    </div>
  );
}

// -----
// How the scan was set up. It matters for repeating a scan and for the cost,
// and not for the decision, so it sits closed near the bottom and the header
// keeps to what the branch page's header holds.
// -----
function ScanSetupColumn({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section aria-label={label} className="grid content-start gap-4 p-6">
      <h2 className="text-sm font-medium text-muted-foreground">{label}</h2>
      <dl className="grid gap-4">{children}</dl>
    </section>
  );
}

export function ScanRunDetails({ scan }: { scan: ScanStatus }) {
  if (scan.status !== "succeeded") {
    const took = scanDuration(scan.usage?.durationMs ?? (scan.finishedAt ? Date.parse(scan.finishedAt) - Date.parse(scan.createdAt) : null));
    return (
      <Card className="grid overflow-hidden lg:grid-cols-3 lg:divide-x">
        <ScanSetupColumn label="What was scanned">
          <Fact label="Repository">{scan.archive ? `Zip ${scan.archive.label}` : scan.repo}</Fact>
          <Fact label="Branch">{scan.branch ?? (scan.ref ? scan.ref : "Default branch")}</Fact>
          <Fact label="Commit">{scan.commitSha ? <span className="font-mono">{scan.commitSha.slice(0, 7)}</span> : "Not read: the scan ended before it cloned"}</Fact>
        </ScanSetupColumn>
        <ScanSetupColumn label="How it was set up">
          <Fact label="Kind of review">
            {labelOf(SCAN_SKILL_OPTIONS, scan.skill)}
            {scan.skill === "full" ? `, ${labelOf(SCAN_PROFILE_OPTIONS, scan.profile).toLowerCase()}` : ""}
          </Fact>
          <Fact label="Model">{labelOf(SCAN_MODEL_NAMES, scan.model)}</Fact>
          <Fact label="Effort">{labelOf(SCAN_EFFORT_OPTIONS, scan.effort)}</Fact>
        </ScanSetupColumn>
        <ScanSetupColumn label="Where it ran">
          <Fact label="Computer">{scan.runner?.name ?? "Elise's cloud"}</Fact>
          <Fact label="Started">
            <ScanTime value={scan.createdAt} />
          </Fact>
          <Fact label="Ran for">{took ?? "Not recorded"}</Fact>
        </ScanSetupColumn>
      </Card>
    );
  }

  return (
    <Card>
      <Collapsible>
        <CardHeader className="gap-1.5">
          <CardTitle>
            <CollapsibleTrigger className="group flex min-h-8 w-full items-center justify-between gap-3 rounded-sm text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              Run details
              <ChevronUp aria-hidden="true" className="size-4 shrink-0 rotate-180 text-muted-foreground transition-transform group-data-[panel-open]:rotate-0" />
            </CollapsibleTrigger>
          </CardTitle>
          <p className="max-w-copy text-sm leading-relaxed text-muted-foreground">The kind of review, the model and the effort this scan ran with.</p>
        </CardHeader>
        <CollapsiblePanel>
          <CardContent>
            <dl className="grid grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-3">
              <Fact label="Kind of review">
                {labelOf(SCAN_SKILL_OPTIONS, scan.skill)}
                {scan.skill === "full" ? `, ${labelOf(SCAN_PROFILE_OPTIONS, scan.profile).toLowerCase()}` : ""}
              </Fact>
              <Fact label="Model">{labelOf(SCAN_MODEL_NAMES, scan.model)}</Fact>
              <Fact label="Effort">{labelOf(SCAN_EFFORT_OPTIONS, scan.effort)}</Fact>
            </dl>
          </CardContent>
        </CollapsiblePanel>
      </Collapsible>
    </Card>
  );
}
