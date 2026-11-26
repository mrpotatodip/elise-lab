import { describe, expect, it } from "vitest";
import type { Project, Repo } from "@repo/contracts/elise";
import { repoSections, UNGROUPED_KEY } from "#/modules/repo/utils/repo-sections";

const project = (id: string, name: string): Project => ({ id, name, createdAt: "2026-01-01T00:00:00.000Z" });

const repo = (
  id: string,
  projectId: string | null,
  critical: number,
  high: number,
  lastScanAt: string | null,
): Repo => ({
  id,
  url: `https://github.com/o/${id}`,
  canonical: `o/${id}`,
  projectId,
  defaultBranch: "main",
  branchNames: ["main"],
  scans: 1,
  lastScanId: null,
  lastScanStatus: null,
  lastScanAt,
  open: {
    total: critical + high,
    severity: { critical, high, medium: 0, low: 0, informational: 0 },
    needsValidation: 0,
    regressed: 0,
    unchecked: 0,
  },
});

const api = project("00000000-0000-4000-8000-000000000001", "api");
const web = project("00000000-0000-4000-8000-000000000002", "Web");
const empty = project("00000000-0000-4000-8000-000000000003", "Zeta");

describe("repoSections", () => {
  const repos = [
    repo("a", web.id, 1, 2, "2026-03-01T00:00:00Z"),
    repo("b", null, 0, 5, "2026-04-01T00:00:00Z"),
    repo("c", web.id, 2, 0, "2026-05-01T00:00:00Z"),
    repo("d", api.id, 0, 1, null),
  ];
  const sections = repoSections(repos, [empty, web, api]);

  it("sorts Projects alphabetically ignoring case, Ungrouped last, and keeps an empty Project", () => {
    expect(sections.map((s) => s.name)).toEqual(["api", "Web", "Zeta", "Ungrouped"]);
    expect(sections.at(-1)?.key).toBe(UNGROUPED_KEY);
    expect(sections[2]?.repos).toEqual([]);
  });

  it("keeps the input order of Repos inside a section", () => {
    expect(sections[1]?.repos.map((r) => r.id)).toEqual(["a", "c"]);
  });

  it("sums each header from its rows and takes the latest Scan time", () => {
    const webSection = sections[1];
    expect(webSection?.totals.total).toBe(5);
    expect(webSection?.totals.severity.critical).toBe(3);
    expect(webSection?.totals.severity.high).toBe(2);
    expect(webSection?.lastScanAt).toBe("2026-05-01T00:00:00Z");
    expect(sections[0]?.lastScanAt).toBeNull();
  });

  it("lists a Repo of an unknown Project as Ungrouped and omits an empty Ungrouped", () => {
    expect(
      repoSections([repo("x", "00000000-0000-4000-8000-0000000000ff", 0, 0, null)], [api])[1]?.repos.map((r) => r.id),
    ).toEqual(["x"]);
    expect(repoSections([repo("y", api.id, 0, 0, null)], [api]).map((s) => s.key)).toEqual([api.id]);
  });
});
