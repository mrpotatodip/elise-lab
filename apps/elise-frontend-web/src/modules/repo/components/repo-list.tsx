import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useTable } from "@tanstack/react-table";
import { FolderGit2, Search } from "lucide-react";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { DataTable } from "#/components/ui/data-table";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "#/components/ui/empty";
import { dataTableColumns, dataTableFeatures } from "#/lib/data-table";
import { GithubPrivateBadge } from "#/modules/github";
import { ScanNewDialog, ScanStatusBadge, ScanTime } from "#/modules/scan";
import { ShellFilterBar, ShellListCount, ShellSearchField } from "#/modules/shell";
import { reposQuery } from "../hooks";
import type { Repo } from "../schemas";
import { repoAttention, repoName } from "../utils";
import { RepoAddDialog } from "./repo-add-dialog";
import { RepoOpenFindings } from "./repo-open-findings";
import { RepoSummary } from "./repo-summary";

const SEARCH_FROM = 6;

const column = dataTableColumns<Repo>();

const columns = column.columns([
  column.display({
    id: "repository",
    header: "Repository",
    cell: ({ row }) => {
      const repo = row.original;
      return (
        <span className="grid gap-0.5">
          <span className="flex items-center gap-2">
            <Link to="/repos/$repoId" params={{ repoId: repo.id }} className="inline-flex min-h-6 items-center rounded-sm font-medium underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
              {repoName(repo.url)}
            </Link>
            <GithubPrivateBadge isPrivate={repo.isPrivate} />
          </span>
          <span className="text-xs text-muted-foreground tabular-nums">
            {repo.scans} {repo.scans === 1 ? "scan" : "scans"}
          </span>
        </span>
      );
    },
  }),
  column.display({
    id: "branches",
    header: "Branches",
    cell: ({ row }) => {
      const repo = row.original;
      const names = repo.branchNames.length > 0 ? repo.branchNames : repo.defaultBranch ? [repo.defaultBranch] : [];
      if (names.length === 0) return <span className="text-muted-foreground">None tracked yet</span>;
      return (
        <span className="flex flex-wrap gap-1.5">
          {names.map((branch) => (
            <Link
              key={branch}
              to="/repos/$repoId"
              params={{ repoId: repo.id }}
              search={{ branch }}
              className="inline-flex min-h-6 items-center rounded-md bg-secondary px-2 font-mono text-xs transition-colors hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {branch}
              {branch === repo.defaultBranch ? " (default)" : ""}
            </Link>
          ))}
        </span>
      );
    },
  }),
  column.display({ id: "open", header: "Open findings", cell: ({ row }) => <RepoOpenFindings open={row.original.open} /> }),
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

export function RepoList() {
  const { data } = useSuspenseQuery(reposQuery());
  const [search, setSearch] = useState("");
  const sorted = data.repos.toSorted((a, b) => repoAttention(b) - repoAttention(a) || (b.lastScanAt ?? "").localeCompare(a.lastScanAt ?? ""));
  const query = search.trim().toLowerCase();
  const visible = sorted.filter((repo) => query === "" || repo.canonical.toLowerCase().includes(query) || repoName(repo.url).toLowerCase().includes(query) || repo.branchNames.some((name) => name.toLowerCase().includes(query)));
  const table = useTable({ features: dataTableFeatures, columns, data: visible, getRowId: (repo) => repo.id });

  if (data.repos.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Repositories</CardTitle>
          <p className="max-w-copy text-sm leading-relaxed text-muted-foreground">Every repository you scan, with what is still open in it.</p>
        </CardHeader>
        <CardContent className="overflow-hidden p-0">
          <Empty className="py-14">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <FolderGit2 />
              </EmptyMedia>
              <EmptyTitle>No repositories yet</EmptyTitle>
              <EmptyDescription>A repository appears here after its first scan, with every finding it has had and what happened to each.</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <RepoAddDialog label="Add a repository" size="default" variant="default" />
              <ScanNewDialog label="Start your first audit" size="default" variant="outline" />
            </EmptyContent>
          </Empty>
        </CardContent>
      </Card>
    );
  }

  return (
    <>
      <RepoSummary repos={sorted} />
      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
          <div className="grid gap-1.5">
            <CardTitle>All repositories</CardTitle>
            <p className="max-w-copy text-sm leading-relaxed text-muted-foreground">Sorted by what needs attention first: findings that came back, then the most severe.</p>
          </div>
          <ShellListCount shown={visible.length} total={sorted.length} noun="repository" plural="repositories" />
        </CardHeader>
        <CardContent className="overflow-hidden p-0">
          {sorted.length >= SEARCH_FROM && (
            <ShellFilterBar className="justify-end">
              <ShellSearchField id="repo-search" name="search" label="Search repositories and branches by name" placeholder="Search by repository or branch" value={search} onChange={(event) => setSearch(event.target.value)} />
            </ShellFilterBar>
          )}
          {visible.length === 0 ? (
            <Empty className="py-12">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Search />
                </EmptyMedia>
                <EmptyTitle>No repositories match</EmptyTitle>
                <EmptyDescription>Check the spelling, or clear the search to see every repository.</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button variant="outline" onClick={() => setSearch("")}>
                  Clear filters
                </Button>
              </EmptyContent>
            </Empty>
          ) : (
            <DataTable table={table} />
          )}
        </CardContent>
      </Card>
    </>
  );
}
