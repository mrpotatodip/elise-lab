import { useInfiniteQuery } from "@tanstack/react-query";
import { ChevronUp, Link2 } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Collapsible, CollapsiblePanel, CollapsibleTrigger } from "#/components/ui/collapsible";
import { range, SkeletonBar } from "#/components/ui/skeleton";
import { useHydrated } from "#/lib/use-hydrated";
import { cn } from "#/lib/utils";
import { repoFindingsQuery, type Repo, type RepoFinding } from "#/modules/repo";
import { ScanSeverityBadge } from "#/modules/scan";
import { SUMMARY_COPY } from "../constants";
import { findingAnchor, findingPath, findingStateLabel, findingWhere, openFindings } from "../utils";

const STATE_VARIANT = { regressed: "destructive", needs_validation: "warning", confirmed: "outline" } as const;

const stateVariant = (finding: Pick<RepoFinding, "state" | "status">) => (finding.state === "regressed" ? STATE_VARIANT.regressed : STATE_VARIANT[finding.status]);

function Fact({ label, children, className }: { label: string; children: string; className?: string }) {
  return (
    <div className={cn("grid content-start gap-1", className)}>
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="max-w-copy text-sm leading-relaxed">{children}</dd>
    </div>
  );
}

function CopyLink({ repoId, finding }: { repoId: string; finding: Pick<RepoFinding, "id" | "title"> }) {
  const copy = () => {
    navigator.clipboard.writeText(`${window.location.origin}${findingPath(repoId, finding.id)}`).then(
      () => toast.success(SUMMARY_COPY.linkCopied),
      () => toast.error(SUMMARY_COPY.linkFailed),
    );
  };

  return (
    <Button type="button" variant="ghost" size="sm" onClick={copy} aria-label={`Copy link to: ${finding.title}`} className="text-muted-foreground">
      <Link2 aria-hidden="true" />
      Copy link
    </Button>
  );
}

// -----
// A finding is written out in full, the same for everyone who opens its
// link: what it is, where it is, what could happen, how it gets fixed, and
// what a person must check when the agent could not confirm it. The id in
// the link scrolls here and marks it. The ref runs when a row mounts, which
// covers a row that a later page brings in; a hash that changes while the
// row is on the page is the browser's own jump. The hash may be encoded.
// -----
const scrollWhenLinked = (row: HTMLLIElement | null) => {
  const hash = window.location.hash.slice(1);
  if (row !== null && (row.id === hash || encodeURIComponent(row.id) === hash)) row.scrollIntoView({ block: "start" });
};

function SummaryFinding({ repoId, finding, first }: { repoId: string; finding: RepoFinding; first: boolean }) {
  const needs = finding.status === "needs_validation" ? finding.needs : null;
  const where = findingWhere(finding);
  const hasDetail = Boolean(finding.impact || finding.fix || needs);
  const hydrated = useHydrated();
  const hash = hydrated ? window.location.hash.slice(1) : "";
  const linked = hash === findingAnchor(finding.id) || hash === encodeURIComponent(findingAnchor(finding.id));
  const open = first || linked;

  return (
    <li ref={scrollWhenLinked} id={findingAnchor(finding.id)} className="scroll-mt-20 target:bg-accent/40 target:shadow-[inset_3px_0_0_0_var(--primary)]">
      <Collapsible key={open ? "open" : "closed"} defaultOpen={open}>
        <div className="grid items-center gap-x-6 gap-y-2 px-6 py-4 lg:grid-cols-[12rem_minmax(0,1fr)_auto_auto]">
          <div className="flex flex-wrap items-center gap-1.5">
            {finding.severity !== null && <ScanSeverityBadge severity={finding.severity} />}
            <Badge variant={stateVariant(finding)}>{findingStateLabel(finding)}</Badge>
          </div>
          <div className="grid min-w-0 gap-0.5">
            <h3 className="max-w-copy text-[15px] font-semibold leading-snug">{finding.title}</h3>
            {where && (
              <p className="truncate font-mono text-xs text-muted-foreground">
                <span className="sr-only">{SUMMARY_COPY.whereLabel}: </span>
                {where}
              </p>
            )}
          </div>
          <CopyLink repoId={repoId} finding={finding} />
          {hasDetail && (
            <CollapsibleTrigger aria-label={`Read: ${finding.title}`} className="group inline-flex min-h-8 items-center gap-1 rounded-md px-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              Read
              <ChevronUp aria-hidden="true" className="size-4 rotate-180 transition-transform group-data-[panel-open]:rotate-0" />
            </CollapsibleTrigger>
          )}
        </div>
        {hasDetail && (
          <CollapsiblePanel>
            <dl className="grid gap-x-12 gap-y-4 border-t bg-muted/30 px-6 py-5 lg:grid-cols-2">
              {finding.impact && <Fact label={SUMMARY_COPY.impactLabel}>{finding.impact}</Fact>}
              {finding.fix && <Fact label={SUMMARY_COPY.fixLabel}>{finding.fix}</Fact>}
              {needs && (
                <Fact label={SUMMARY_COPY.needsLabel} className="lg:col-span-2">
                  {needs}
                </Fact>
              )}
            </dl>
          </CollapsiblePanel>
        )}
      </Collapsible>
    </li>
  );
}

function FindingsPending() {
  return (
    <CardContent className="grid gap-3" aria-busy="true">
      {range(3).map((row) => (
        <SkeletonBar key={row} className="h-20 w-full" />
      ))}
    </CardContent>
  );
}

export function SummaryFindings({ repo }: { repo: Repo }) {
  const { data, isPending, isError, refetch, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery(repoFindingsQuery(repo.id, { branch: repo.defaultBranch ?? undefined, triage: "open" }));
  const findings = data ? openFindings(data.pages.flatMap((page) => page.findings)) : [];

  return (
    <Card>
      <CardHeader className="gap-1.5">
        <CardTitle>{SUMMARY_COPY.findingsTitle}</CardTitle>
        <p className="max-w-copy text-sm leading-relaxed text-muted-foreground">Each one says where it is in the code, what could happen, and how your developer fixes it.</p>
      </CardHeader>
      {isPending ? (
        <FindingsPending />
      ) : isError ? (
        <CardContent>
          <div role="alert" className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-status-danger">{SUMMARY_COPY.loadFailed}</p>
            <Button variant="outline" size="sm" onClick={() => void refetch()}>
              Try again
            </Button>
          </div>
        </CardContent>
      ) : (
        <CardContent className="overflow-hidden p-0">
          {findings.length === 0 ? (
            <p className="px-6 py-5 text-sm text-muted-foreground">{SUMMARY_COPY.nothingOpen}</p>
          ) : (
            <ul className="divide-y border-t">
              {findings.map((finding, index) => (
                <SummaryFinding key={finding.id} repoId={repo.id} finding={finding} first={index === 0} />
              ))}
            </ul>
          )}
          {hasNextPage && (
            <div className="flex justify-center border-t p-4">
              <Button variant="outline" size="sm" disabled={isFetchingNextPage} onClick={() => void fetchNextPage()}>
                {isFetchingNextPage ? "Loading" : "Show more findings"}
              </Button>
            </div>
          )}
        </CardContent>
      )}
    </Card>
  );
}
