import { describe, expect, it } from "vitest";
import { scanActivity } from "#/modules/scan/utils/scan-activity";
import { scanArchiveNote } from "#/modules/scan/utils/scan-archive-note";
import { scanFindingPrompt, scanFindingsPrompt } from "#/modules/scan/utils/scan-finding-prompt";
import { scanPlanSummary } from "#/modules/scan/utils/scan-plan-summary";
import { scanRepoName } from "#/modules/scan/utils/scan-repo-name";
import { scanSidebarItems } from "#/modules/scan/utils/scan-sidebar";
import { scanSuccessRate } from "#/modules/scan/utils/scan-success-rate";

describe("scanArchiveNote", () => {
  const hash = "3ff652db2f06f3e24d5eb0824d3e1ee38401754fe10663f374417be55ce39061";

  it.each([
    ["a git Scan", null, null],
    ["a Scan of a stored zip", { id: "0d6f7a1e-9c1b-4f7e-8a43-5b2e9d4c7a10", label: "app-1.2.zip", contentSha256: hash }, "app-1.2.zip"],
    ["a Scan whose zip was removed", { id: null, label: "app-1.2.zip", contentSha256: hash }, "app-1.2.zip (file removed)"],
  ])("names the zip of %s", (_, archive, note) => {
    expect(scanArchiveNote(archive)).toBe(note);
  });
});

describe("scanSuccessRate", () => {
  it("is null before any scan finishes", () => {
    expect(scanSuccessRate(0, 0)).toBeNull();
  });

  it("rounds the share of succeeded scans among finished ones", () => {
    expect(scanSuccessRate(19, 3)).toBe(86);
    expect(scanSuccessRate(0, 4)).toBe(0);
  });
});

describe("scanRepoName", () => {
  it("splits a GitHub URL into owner and name", () => {
    expect(scanRepoName("https://github.com/honojs/hono.git", "id")).toEqual({ owner: "honojs", name: "hono" });
  });

  it("names an upload app by its name, which no git provider reads", () => {
    expect(scanRepoName("Billing API", "s1")).toEqual({ owner: "", name: "Billing API" });
  });

  it("falls back to the scan id when the repo is missing", () => {
    expect(scanRepoName(null, "s1")).toEqual({ owner: "", name: "s1" });
  });
});

describe("scanActivity", () => {
  const now = new Date("2026-11-08T12:00:00Z");

  it("returns one bucket per day ending today", () => {
    const days = scanActivity([], 3, now);
    expect(days.map((d) => d.key)).toEqual(["2026-11-06", "2026-11-07", "2026-11-08"]);
  });

  it("counts scans by status and ignores scans outside the window", () => {
    const days = scanActivity(
      [
        { createdAt: "2026-11-08T01:00:00Z", status: "succeeded" },
        { createdAt: "2026-11-08T05:00:00Z", status: "failed" },
        { createdAt: "2026-11-08T06:00:00Z", status: "running" },
        { createdAt: "2026-10-01T06:00:00Z", status: "succeeded" },
      ],
      3,
      now,
    );
    expect(days[2]).toMatchObject({ succeeded: 1, failed: 1, active: 1, total: 3 });
    expect(days.reduce((sum, d) => sum + d.total, 0)).toBe(3);
  });
});

describe("scanActivity and a stopped Scan", () => {
  it("leaves a stopped Scan out of every bucket, so it is not counted as active", () => {
    const days = scanActivity([{ createdAt: "2026-11-08T01:00:00Z", status: "stopped" }], 1, new Date("2026-11-08T12:00:00Z"));

    expect(days[0]).toMatchObject({ succeeded: 0, failed: 0, active: 0, total: 0 });
  });
});

describe("scanSidebarItems", () => {
  const scans = [
    { scanId: "a", repoId: "r1", repo: "https://github.com/acme/api", status: "running" as const },
    { scanId: "b", repoId: "r2", repo: "https://github.com/acme/web", status: "queued" as const },
    { scanId: "c", repoId: "r1", repo: "https://github.com/acme/api", status: "failed" as const },
    { scanId: "d", repoId: "r3", repo: "https://github.com/acme/cli", status: "succeeded" as const },
  ];

  it("lists each repository once, in the order of its newest scan, with that scan's status", () => {
    const { repos, repoCount } = scanSidebarItems(scans);
    expect(repos.map((r) => [r.id, r.name, r.status])).toEqual([
      ["r1", "api", "running"],
      ["r2", "web", "queued"],
      ["r3", "cli", "succeeded"],
    ]);
    expect(repoCount).toBe(3);
  });

  it("counts the scans in progress and all scans", () => {
    const { running, total } = scanSidebarItems(scans);
    expect(running).toBe(2);
    expect(total).toBe(4);
  });

  it("marks a repository private from its newest scan, and only when the engine said so", () => {
    const { repos } = scanSidebarItems([
      { scanId: "a", repoId: "r1", repo: "https://github.com/acme/closed", status: "succeeded" as const, isPrivate: true },
      { scanId: "b", repoId: "r2", repo: "https://github.com/acme/open", status: "succeeded" as const, isPrivate: null },
      { scanId: "c", repoId: "r3", repo: "https://github.com/acme/older", status: "succeeded" as const },
      { scanId: "d", repoId: "r1", repo: "https://github.com/acme/closed", status: "succeeded" as const, isPrivate: false },
    ]);

    expect(repos.map((r) => [r.name, r.isPrivate])).toEqual([
      ["closed", true],
      ["open", false],
      ["older", false],
    ]);
  });

  it("caps the list at five repositories but still counts them all", () => {
    const many = Array.from({ length: 9 }, (_, i) => ({ scanId: `s${i}`, repoId: `r${i}`, repo: `https://github.com/acme/r${i}`, status: "succeeded" as const }));
    const { repos, repoCount } = scanSidebarItems(many);
    expect(repos).toHaveLength(5);
    expect(repoCount).toBe(9);
  });
});

describe("scanPlanSummary", () => {
  const base = { repo: "https://github.com/honojs/hono", model: "claude-sonnet-5-5", effort: "high", profile: "standard" } as const;

  it("says nothing until the repository link is valid", () => {
    expect(scanPlanSummary({ ...base, repo: "not-a-repo" })).toBeNull();
  });

  it.each([
    ["quick", "focused audit"],
    ["standard", "balanced audit"],
    ["deep", "exhaustive audit"],
  ] as const)("names the %s profile in plain words", (profile, words) => {
    expect(scanPlanSummary({ ...base, profile })).toContain(`${words} of honojs/hono with Claude Sonnet 5.5`);
  });

  it("names the upload app and the zip the Scan reads", () => {
    const plan = { ...base, provider: "upload", repo: "Billing API", archiveId: "0d6f7a1e-9c1b-4f7e-8a43-5b2e9d4c7a10", runnerId: "6f1c1f8e-2b7a-4c55-9a0e-6f3d2f6b1a01" } as const;
    expect(scanPlanSummary(plan, "Studio Mac", "billing-1.3.zip")).toContain("balanced audit of Billing API (zip billing-1.3.zip) with Claude Sonnet 5.5. It runs on Studio Mac");
  });

  it("reads a repository by the provider the plan names, groups inside groups included", () => {
    expect(scanPlanSummary({ ...base, provider: "gitlab", repo: "https://gitlab.com/acme/platform/api" })).toContain("of acme/platform/api with");
  });

  it.each([
    ["github", "https://gitlab.com/acme/api"],
    ["gitlab", "https://github.com/honojs/hono"],
    ["upload", "https://gitlab.com/acme/api"],
  ] as const)("starts nothing when the %s plan holds %s", (provider, repo) => {
    expect(scanPlanSummary({ ...base, provider, repo })).toBeNull();
  });
});

describe("scanFindingPrompt", () => {
  const finding = {
    title: "SQL injection in search",
    state: "confirmed" as const,
    severity: "high" as const,
    place: { file: "src/search.ts", line: 42 },
    detail: { class: "injection", actor: null, impact: "Anyone can read the users table.", evidence: "db.query(`select * from t where q = ${q}`)", fix: "Use a parameterized query.", needs: null, triage: null },
  };

  it("gives the location, evidence and fix", () => {
    const text = scanFindingPrompt(finding);
    expect(text).toContain("Location: src/search.ts:42");
    expect(text).toContain("## Evidence in the code\ndb.query");
    expect(text).toContain("## Suggested fix\nUse a parameterized query.");
  });

  it("lists every finding most severe first and skips rejected ones", () => {
    const low = { ...finding, title: "Verbose errors", severity: "low" as const };
    const rejected = { ...finding, title: "False alarm", state: "rejected" as const };
    const text = scanFindingsPrompt([low, rejected, finding], { repo: "o/n", commit: "abcdef1234" });
    expect(text).toContain("Fix these 2 security findings from an Elise audit in o/n at commit abcdef1");
    expect(text.indexOf("SQL injection")).toBeLessThan(text.indexOf("Verbose errors"));
    expect(text).not.toContain("False alarm");
  });

  it("leaves out sections the finding does not have", () => {
    const text = scanFindingPrompt({ ...finding, place: null, detail: { ...finding.detail, impact: null } });
    expect(text).toContain("No file was recorded");
    expect(text).not.toContain("What could happen");
  });
});
