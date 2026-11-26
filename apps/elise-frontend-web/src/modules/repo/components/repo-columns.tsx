import { Link } from "@tanstack/react-router";
import { dataTableColumns } from "#/lib/data-table";
import { GithubPrivateBadge } from "#/modules/github";
import type { Project } from "#/modules/project";
import { ScanStatusBadge, ScanTime } from "#/modules/scan";
import type { Repo } from "../schemas";
import { repoName } from "../utils";
import { MoveRepoDialog } from "./repo-project-dialogs";
import { RepoOpenFindings } from "./repo-open-findings";

const column = dataTableColumns<Repo>();

const repository = column.display({
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
});

const branches = column.display({
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
});

const open = column.display({ id: "open", header: "Open findings", cell: ({ row }) => <RepoOpenFindings open={row.original.open} /> });

const last = column.display({
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
});

export const readColumns = column.columns([repository, branches, open, last]);

export const writeColumns = (projects: readonly Project[]) =>
  column.columns([
    repository,
    branches,
    open,
    last,
    column.display({
      id: "actions",
      header: () => <span className="sr-only">Actions</span>,
      meta: { cell: "text-right" },
      cell: ({ row }) => <MoveRepoDialog repoId={row.original.id} repoLabel={repoName(row.original.url)} current={row.original.projectId ?? null} projects={projects} />,
    }),
  ]);
