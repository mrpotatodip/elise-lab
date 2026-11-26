import { useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { FolderGit2, Search } from "lucide-react";
import { Button } from "#/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "#/components/ui/card";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "#/components/ui/empty";
import { projectsQuery, useCanManageProjects } from "#/modules/project";
import { ScanNewDialog } from "#/modules/scan";
import { ShellFilterBar, ShellListCount, ShellSearchField } from "#/modules/shell";
import { reposQuery } from "../hooks";
import type { Repo } from "../schemas";
import { repoAttention, repoName, repoSections } from "../utils";
import { RepoAddDialog } from "./repo-add-dialog";
import { NewProjectDialog } from "./repo-project-dialogs";
import { RepoRemovedSection } from "./repo-removed-section";
import { RepoSectionsList, RepoTable } from "./repo-sections-list";
import { RepoSummary } from "./repo-summary";

const SEARCH_FROM = 6;

export function RepoList() {
  const { data } = useSuspenseQuery(reposQuery());
  const { data: projects } = useSuspenseQuery(projectsQuery());
  const canWrite = useCanManageProjects();
  const [search, setSearch] = useState("");
  const sorted = data.repos.toSorted(
    (a, b) => repoAttention(b) - repoAttention(a) || (b.lastScanAt ?? "").localeCompare(a.lastScanAt ?? ""),
  );
  const query = search.trim().toLowerCase();
  const matches = (repo: Repo) =>
    query === "" ||
    repo.canonical.toLowerCase().includes(query) ||
    repoName(repo.url).toLowerCase().includes(query) ||
    repo.branchNames.some((name) => name.toLowerCase().includes(query));
  const visible = sorted.filter(matches);
  const grouped = projects.length > 0;
  const sections = grouped
    ? repoSections(sorted, projects, matches).filter((section) => query === "" || section.repos.length > 0)
    : [];

  if (data.repos.length === 0 && !grouped) {
    return (
      <>
        <Card>
          <CardHeader>
            <CardTitle>Repositories</CardTitle>
            <p className="max-w-copy text-sm leading-relaxed text-muted-foreground">
              Every repository you scan, with what is still open in it.
            </p>
          </CardHeader>
          <CardContent className="overflow-hidden p-0">
            <Empty className="py-14">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <FolderGit2 />
                </EmptyMedia>
                <EmptyTitle>No repositories yet</EmptyTitle>
                <EmptyDescription>
                  A repository appears here after its first scan, with every finding it has had and what happened to
                  each.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <RepoAddDialog label="Add a repository" size="default" variant="default" />
                <ScanNewDialog label="Start your first audit" size="default" variant="outline" />
              </EmptyContent>
            </Empty>
          </CardContent>
        </Card>
        <RepoRemovedSection />
      </>
    );
  }

  return (
    <>
      <RepoSummary repos={sorted} />
      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
          <div className="grid gap-1.5">
            <CardTitle>All repositories</CardTitle>
            <p className="max-w-copy text-sm leading-relaxed text-muted-foreground">
              Sorted by what needs attention first: findings that came back, then the most severe.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {canWrite && <NewProjectDialog />}
            <ShellListCount shown={visible.length} total={sorted.length} noun="repository" plural="repositories" />
          </div>
        </CardHeader>
        <CardContent className="overflow-hidden p-0">
          {sorted.length >= SEARCH_FROM && (
            <ShellFilterBar className="justify-end">
              <ShellSearchField
                id="repo-search"
                name="search"
                label="Search repositories and branches by name"
                placeholder="Search by repository or branch"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
              />
            </ShellFilterBar>
          )}
          {visible.length === 0 && query !== "" ? (
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
          ) : grouped ? (
            <RepoSectionsList sections={sections} projects={projects} canWrite={canWrite} />
          ) : (
            <RepoTable repos={visible} projects={projects} canWrite={canWrite} />
          )}
        </CardContent>
      </Card>
      <RepoRemovedSection />
    </>
  );
}
