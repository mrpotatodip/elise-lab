import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Badge } from "#/components/ui/badge";
import { Card } from "#/components/ui/card";
import { ScanSeverityDots, scanPlural } from "#/modules/scan";
import type { Repo } from "../schemas";
import { repoName, repoTotals } from "../utils";
import { RepoAddDialog } from "./repo-add-dialog";

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

export function RepoSummary({ repos }: { repos: readonly Repo[] }) {
  const totals = repoTotals(repos);
  const scans = repos.reduce((sum, repo) => sum + repo.scans, 0);
  const notRated = totals.total - Object.values(totals.severity).reduce((sum, count) => sum + count, 0);
  const attention = repos.filter((repo) => repo.open.total > 0).slice(0, 3);

  return (
    <section aria-label="Repositories summary">
      <Card className="grid overflow-hidden lg:grid-cols-3 lg:divide-x">
        <Column label="Repositories" footer={<RepoAddDialog />}>
          <p className="text-[40px] font-semibold leading-none tracking-tight tabular-nums">
            {repos.length}
            <span className="ml-1.5 text-sm font-normal tracking-normal text-muted-foreground">{repos.length === 1 ? "repository" : "repositories"}</span>
          </p>
          <p className="max-w-copy text-sm leading-relaxed text-muted-foreground">
            {scanPlural(scans, "scan", "scans")} so far. A repository appears here after its first scan, with every finding it has had.
          </p>
        </Column>

        <Column label="Open findings">
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
              <p className="max-w-copy text-sm leading-relaxed text-muted-foreground">
                {totals.regressed > 0 ? `${totals.regressed} came back after a fix. ` : ""}
                {totals.needsValidation > 0 ? `${totals.needsValidation} need a person to check by hand.` : "Every open finding was verified."}
              </p>
            </>
          )}
        </Column>

        <Column label="Needs attention">
          {attention.length === 0 ? (
            <p className="max-w-copy text-sm leading-relaxed text-muted-foreground">No repository has anything open.</p>
          ) : (
            <ul className="divide-y rounded-lg border">
              {attention.map((repo) => (
                <li key={repo.id}>
                  <Link to="/repos/$repoId" params={{ repoId: repo.id }} className="flex items-center justify-between gap-4 px-4 py-3 transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
                    <span className="truncate text-sm font-medium">{repoName(repo.url)}</span>
                    <span className="flex shrink-0 items-center gap-2">
                      {repo.open.regressed > 0 && <Badge variant="destructive">{repo.open.regressed} came back</Badge>}
                      <span className="text-sm tabular-nums text-muted-foreground">{repo.open.total} open</span>
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
