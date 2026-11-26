import { useState } from "react";
import { useRouteContext } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "#/components/ui/button";
import { Card } from "#/components/ui/card";
import { ScanTime } from "#/modules/scan";
import { removedReposQuery, useRestoreRepo } from "../hooks";
import type { Repo } from "../schemas";
import { canRemoveRepos, repoName } from "../utils";

function RemovedRow({ repo }: { repo: Repo }) {
  const restore = useRestoreRepo(repo.id, repoName(repo.url));

  return (
    <li className="flex items-center justify-between gap-3 px-6 py-3">
      <span className="grid gap-0.5">
        <span className="font-medium">{repoName(repo.url)}</span>
        <span className="text-xs text-muted-foreground">
          {repo.scans} {repo.scans === 1 ? "scan" : "scans"}
          {repo.removedAt && (
            <>
              , removed <ScanTime value={repo.removedAt} />
            </>
          )}
        </span>
      </span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={restore.isPending}
        aria-label={`Restore ${repoName(repo.url)}`}
        onClick={() => restore.mutate()}
      >
        {restore.isPending ? "Restoring" : "Restore"}
      </Button>
    </li>
  );
}

export function RepoRemovedSection() {
  const { user } = useRouteContext({ from: "/_app" });
  const allowed = canRemoveRepos(user?.powers ?? []);
  const [open, setOpen] = useState(false);
  const { data } = useQuery({ ...removedReposQuery(), enabled: allowed });

  if (!allowed) return null;

  const repos = data?.repos ?? [];
  const Chevron = open ? ChevronDown : ChevronRight;

  return (
    <Card>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 rounded-xl px-6 py-4 text-left text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Chevron aria-hidden="true" className="size-4 text-muted-foreground" />
        Removed ({repos.length})
      </button>
      {open && (
        <ul className="divide-y border-t">
          {repos.length === 0 ? (
            <li className="px-6 py-4 text-sm text-muted-foreground">No Removed Repos.</li>
          ) : (
            repos.map((repo) => <RemovedRow key={repo.id} repo={repo} />)
          )}
        </ul>
      )}
    </Card>
  );
}
