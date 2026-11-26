import { useMemo } from "react";
import { useTable } from "@tanstack/react-table";
import { ChevronDown, ChevronRight } from "lucide-react";
import { DataTable } from "#/components/ui/data-table";
import { dataTableFeatures } from "#/lib/data-table";
import type { Project } from "#/modules/project";
import { ScanTime } from "#/modules/scan";
import { useRepoCollapsedSections } from "../hooks/use-repo-collapsed-sections";
import type { Repo } from "../schemas";
import type { RepoSection } from "../utils";
import { readColumns, writeColumns } from "./repo-columns";
import { RepoOpenFindings } from "./repo-open-findings";
import { DeleteProjectDialog, RenameProjectDialog } from "./repo-project-dialogs";

type SectionTableProps = { repos: Repo[]; projects: readonly Project[]; canWrite: boolean };

export function RepoTable({ repos, projects, canWrite }: SectionTableProps) {
  const columns = useMemo(
    () => (canWrite && projects.length > 0 ? writeColumns(projects) : readColumns),
    [canWrite, projects],
  );
  const table = useTable({ features: dataTableFeatures, columns, data: repos, getRowId: (repo) => repo.id });
  return <DataTable table={table} />;
}

type RepoSectionsListProps = { sections: RepoSection[]; projects: readonly Project[]; canWrite: boolean };

export function RepoSectionsList({ sections, projects, canWrite }: RepoSectionsListProps) {
  const { collapsed, toggle } = useRepoCollapsedSections();

  return (
    <div className="divide-y">
      {sections.map((section) => {
        const folded = collapsed.includes(section.key);
        const panelId = `repo-section-${section.key}`;
        return (
          <section key={section.key} aria-label={section.name}>
            <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 bg-muted/40 px-4 py-3">
              <button
                type="button"
                aria-expanded={!folded}
                aria-controls={panelId}
                onClick={() => toggle(section.key)}
                className="inline-flex min-h-8 items-center gap-2 rounded-sm text-left font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {folded ? (
                  <ChevronRight aria-hidden="true" className="size-4" />
                ) : (
                  <ChevronDown aria-hidden="true" className="size-4" />
                )}
                {section.name}
                <span className="text-xs font-normal tabular-nums text-muted-foreground">
                  {section.repos.length} {section.repos.length === 1 ? "repository" : "repositories"}
                </span>
              </button>
              <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
                {section.repos.length > 0 && <RepoOpenFindings open={section.totals} />}
                {section.lastScanAt && (
                  <span className="text-xs text-muted-foreground">
                    Latest scan <ScanTime value={section.lastScanAt} />
                  </span>
                )}
                {canWrite && section.project && (
                  <span className="flex items-center gap-1">
                    <RenameProjectDialog project={section.project} />
                    <DeleteProjectDialog project={section.project} />
                  </span>
                )}
              </div>
            </div>
            <div id={panelId} hidden={folded}>
              {section.repos.length === 0 ? (
                <p className="px-4 py-6 text-sm text-muted-foreground">No repos yet</p>
              ) : (
                <RepoTable repos={section.repos} projects={projects} canWrite={canWrite} />
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}
