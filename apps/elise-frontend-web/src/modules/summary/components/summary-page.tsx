import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useTable } from "@tanstack/react-table";
import { FolderGit2 } from "lucide-react";
import { Badge } from "#/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { DataTable } from "#/components/ui/data-table";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "#/components/ui/empty";
import { Progress } from "#/components/ui/progress";
import { dataTableColumns, dataTableFeatures } from "#/lib/data-table";
import { rankRepos, repoName, reposQuery, repoTotals, RepoOpenFindings, type Repo } from "#/modules/repo";
import { ScanSeverityDots, ScanStatusBadge, ScanTime } from "#/modules/scan";
import { ShellPageHeader } from "#/modules/shell";
import { SUMMARY_COPY } from "../constants";
import { REPO_STATUS_BADGE, repoStatus, repoSubtitle, summaryStanding } from "../utils";

type ColumnProps = { label: string; children: ReactNode };

function Column({ label, children }: ColumnProps) {
  return (
    <section aria-label={label} className="grid content-start gap-4 p-6">
      <h2 className="text-sm font-medium text-muted-foreground">{label}</h2>
      {children}
    </section>
  );
}

function SummaryOverview({ repos }: { repos: readonly Repo[] }) {
  const scanned = repos.filter((repo) => repo.defaultBranch !== null);
  const needing = scanned.filter((repo) => repoStatus(repo) === "attention");
  const clear = scanned.length - needing.length;
  const percent = scanned.length > 0 ? Math.round((clear / scanned.length) * 100) : 0;
  const totals = repoTotals(repos);
  const notRated = totals.total - Object.values(totals.severity).reduce((sum, count) => sum + count, 0);

  return (
    <section aria-label="Security summary">
      <Card className="grid overflow-hidden lg:grid-cols-3 lg:divide-x">
        <Column label="Where you stand">
          <p className="text-[40px] font-semibold leading-none tracking-tight tabular-nums">
            {needing.length}
            <span className="ml-1.5 text-sm font-normal tracking-normal text-muted-foreground">of {scanned.length} need attention</span>
          </p>
          <Progress value={percent} indicatorClassName="bg-primary/55" aria-label={`Clear: ${clear} of ${scanned.length} repositories`} />
          <p className="max-w-copy text-sm leading-relaxed text-muted-foreground">{summaryStanding(repos)}</p>
        </Column>

        <Column label="What is still open">
          <p className="text-[40px] font-semibold leading-none tracking-tight tabular-nums">{totals.total}</p>
          {totals.total === 0 ? (
            <p className="max-w-copy text-sm leading-relaxed text-muted-foreground">Nothing is open across your repositories.</p>
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
              <ul className="grid gap-1 text-sm leading-relaxed text-muted-foreground">
                <li>{totals.regressed > 0 ? `${totals.regressed} came back after a fix. Look at these first.` : "Nothing that was fixed has returned."}</li>
                <li>{totals.needsValidation > 0 ? `${totals.needsValidation} likely but unverified. Check by hand before acting.` : "Every open finding was verified."}</li>
                {totals.unchecked > 0 && <li>{totals.unchecked} not seen by the latest full scan. They stay open until a person decides them.</li>}
              </ul>
            </>
          )}
        </Column>

        <Column label="Start with">
          {needing.length === 0 ? (
            <p className="max-w-copy text-sm leading-relaxed text-muted-foreground">No repository has anything open.</p>
          ) : (
            <>
              <ul className="divide-y rounded-lg border">
                {needing.slice(0, 3).map((repo) => (
                  <li key={repo.id}>
                    <Link to="/summary/$repoId" params={{ repoId: repo.id }} className="flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
                      <span className="truncate text-sm font-medium">{repoName(repo.url)}</span>
                      <span className="flex shrink-0 items-center gap-2">
                        {repo.open.regressed > 0 && <Badge variant="destructive">{repo.open.regressed} came back</Badge>}
                        <span className="text-sm tabular-nums text-muted-foreground">{repo.open.total} open</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
              <p className="max-w-copy text-sm leading-relaxed text-muted-foreground">{SUMMARY_COPY.findingsNext}</p>
            </>
          )}
        </Column>
      </Card>
    </section>
  );
}

const column = dataTableColumns<Repo>();

const columns = column.columns([
  column.display({
    id: "repository",
    header: "Repository",
    cell: ({ row }) => {
      const repo = row.original;
      const status = REPO_STATUS_BADGE[repoStatus(repo)];
      return (
        <span className="grid gap-0.5">
          <span className="flex items-center gap-2.5">
            {repoStatus(repo) === "attention" ? (
              <Link to="/summary/$repoId" params={{ repoId: repo.id }} className="inline-flex min-h-6 items-center rounded-sm font-medium underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {repoName(repo.url)}
              </Link>
            ) : (
              <span className="font-medium">{repoName(repo.url)}</span>
            )}
            <Badge variant={status.variant}>{status.label}</Badge>
          </span>
          <span className="max-w-copy text-xs leading-relaxed text-muted-foreground">{repoSubtitle(repo)}</span>
        </span>
      );
    },
  }),
  column.display({ id: "open", header: "What is open", cell: ({ row }) => <RepoOpenFindings open={row.original.open} /> }),
  column.display({
    id: "last",
    header: "Last scan",
    cell: ({ row }) => (
      <span className="grid justify-items-start gap-1">
        {row.original.lastScanStatus && <ScanStatusBadge status={row.original.lastScanStatus} />}
        <span className="text-xs text-muted-foreground">
          <ScanTime value={row.original.lastScanAt} />
        </span>
      </span>
    ),
  }),
]);

function SummaryTable({ repos }: { repos: readonly Repo[] }) {
  const table = useTable({ features: dataTableFeatures, columns, data: [...repos], getRowId: (repo) => repo.id });

  return (
    <Card>
      <CardHeader>
        <CardTitle>All repositories</CardTitle>
        <p className="max-w-copy text-sm leading-relaxed text-muted-foreground">{SUMMARY_COPY.readMore} {SUMMARY_COPY.listLegend}</p>
      </CardHeader>
      <CardContent className="overflow-hidden p-0">
        <DataTable table={table} />
      </CardContent>
    </Card>
  );
}

export function SummaryPage() {
  const { data } = useSuspenseQuery(reposQuery());
  const ranked = rankRepos(data.repos);

  return (
    <>
      <ShellPageHeader title="Security status" description="Where each repository stands, and what is still open. Nothing here changes anything." />

      {ranked.length === 0 ? (
        <Card>
          <CardContent className="py-10">
            <Empty>
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <FolderGit2 />
                </EmptyMedia>
                <EmptyTitle>Nothing to review yet</EmptyTitle>
                <EmptyDescription>A repository appears here after its first scan.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          </CardContent>
        </Card>
      ) : (
        <>
          <SummaryOverview repos={ranked} />
          <SummaryTable repos={ranked} />
        </>
      )}
    </>
  );
}
