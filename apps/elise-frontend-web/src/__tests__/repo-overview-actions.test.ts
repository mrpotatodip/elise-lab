import { describe, expect, it } from "vitest";
import type { Repo } from "#/modules/repo";
import { overviewActions, overviewLatestScanAt, overviewVerdict } from "#/modules/repo/utils/repo-overview-actions";

const none = { critical: 0, high: 0, medium: 0, low: 0, informational: 0 };

const repo = (name: string, open: Partial<Repo["open"]> = {}, extra: Partial<Repo> = {}): Repo => ({
  id: `00000000-0000-4000-8000-${name.padStart(12, "0")}`,
  url: `https://github.com/acme/${name}`,
  canonical: `acme/${name}`,
  defaultBranch: "main",
  branchNames: ["main"],
  scans: 1,
  lastScanId: "s1",
  lastScanStatus: "succeeded",
  lastScanAt: "2026-11-19T10:00:00Z",
  open: { total: 0, severity: none, needsValidation: 0, regressed: 0, unchecked: 0, ...open },
  ...extra,
});

const budget = (spentUsd: number, reservedUsd = 0, budgetApplies = true) => ({ budgetApplies, budgetUsd: 100, spentUsd, reservedUsd });
const oldEngineBudget = { budgetUsd: 100, spentUsd: 100, reservedUsd: 0 };

describe("overviewActions", () => {
  it("is empty when nothing needs anyone", () => {
    expect(overviewActions([repo("a")], budget(10))).toEqual([]);
  });

  it("lists the most urgent first and points the first button at the worst repository", () => {
    const repos = [repo("a", { total: 1, regressed: 1 }), repo("b", { total: 6, regressed: 3, needsValidation: 2, unchecked: 1, severity: { ...none, high: 2, medium: 1, low: 1 } })];
    const actions = overviewActions(repos, budget(10));
    expect(actions.map((a) => a.key)).toEqual(["back", "serious", "check", "stale", "lower"]);
    expect(actions[0]?.title).toBe("4 fixed problems have come back");
    expect(actions[0]?.repoId).toBe(repos[1]?.id);
    expect(actions[0]?.primary).toBe("Review the regression in b");
    expect(actions[0]?.repos.map((r) => r.count)).toEqual([3, 1]);
  });

  it.each([
    ["under 90%", budget(89), []],
    ["at 90% with running scans counted", budget(80, 10), ["budget"]],
    ["used up", budget(100), ["budget"]],
    ["the engine says it does not apply", budget(100, 0, false), []],
    ["an older engine does not say", oldEngineBudget, []],
  ] as const)("budget %s", (_case, usage, keys) => {
    expect(overviewActions([repo("a")], usage).map((a) => a.key)).toEqual(keys);
  });

  it("flags a failed latest scan and a repository never scanned, once each", () => {
    const repos = [repo("a", {}, { lastScanStatus: "failed" }), repo("b", {}, { defaultBranch: null, lastScanStatus: null })];
    expect(overviewActions(repos).map((a) => a.key)).toEqual(["failed", "unscanned"]);
  });
});

describe("overviewVerdict", () => {
  it.each([
    ["urgent items block shipping", [repo("a", { total: 1, regressed: 1 })], "danger", "Not ready to ship"],
    ["only warnings are almost there", [repo("a", { total: 1, needsValidation: 1 })], "warning", "Almost there"],
    ["lower-risk problems alone still ship", [repo("a", { total: 1, severity: { ...none, low: 1 } })], "success", "Ready to ship"],
    ["nothing open is ready", [repo("a")], "success", "Ready to ship"],
  ] as const)("%s", (_case, repos, tone, word) => {
    expect(overviewVerdict(overviewActions(repos))).toMatchObject({ tone, word });
  });

  it("names the repository of the urgent items and the failed scan", () => {
    const repos = [repo("api", { total: 1, regressed: 1 }), repo("worker", {}, { lastScanStatus: "failed" })];
    expect(overviewVerdict(overviewActions(repos)).line).toBe("Fix 1 urgent item in acme/api. The latest scan failed on worker.");
  });
});

describe("overviewLatestScanAt", () => {
  it("is the newest scan time, or null when nothing was scanned", () => {
    expect(overviewLatestScanAt([repo("a", {}, { lastScanAt: "2026-11-18T10:00:00Z" }), repo("b", {}, { lastScanAt: "2026-11-19T09:00:00Z" })])).toBe("2026-11-19T09:00:00Z");
    expect(overviewLatestScanAt([repo("a", {}, { lastScanAt: null })])).toBeNull();
  });

  it("skips a scan that was stopped or failed, because it read nothing", () => {
    const stopped = repo("a", {}, { lastScanStatus: "stopped", lastScanAt: "2026-11-19T09:00:00Z" });
    expect(overviewLatestScanAt([repo("b", {}, { lastScanAt: "2026-11-18T10:00:00Z" }), stopped])).toBe("2026-11-18T10:00:00Z");
  });
});
