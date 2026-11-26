import type { Project } from "@repo/contracts/elise";
import type { Repo } from "../schemas";
import { repoTotals } from "./repo-attention";

export const UNGROUPED_KEY = "ungrouped";

export type RepoSection = {
  key: string;
  project: Project | null;
  name: string;
  repos: Repo[];
  totals: ReturnType<typeof repoTotals>;
  lastScanAt: string | null;
};

const latest = (repos: readonly Repo[]) => repos.reduce<string | null>((best, repo) => (repo.lastScanAt !== null && (best === null || repo.lastScanAt > best) ? repo.lastScanAt : best), null);

export function repoSections(repos: readonly Repo[], projects: readonly Project[]): RepoSection[] {
  const known = new Set(projects.map((project) => project.id));
  const section = (key: string, project: Project | null, name: string, rows: Repo[]): RepoSection => ({ key, project, name, repos: rows, totals: repoTotals(rows), lastScanAt: latest(rows) });
  const named = projects.toSorted((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }) || a.id.localeCompare(b.id)).map((project) => section(project.id, project, project.name, repos.filter((repo) => repo.projectId === project.id)));
  const loose = repos.filter((repo) => !repo.projectId || !known.has(repo.projectId));
  return loose.length > 0 ? [...named, section(UNGROUPED_KEY, null, "Ungrouped", loose)] : named;
}
