import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { fakeBindings } from "#/__tests__/fake-bindings";
import type { ScanParams } from "#/schemas";
import { buildScanRecordSvc, readGivenSvc, recordScanSvc } from "#/modules/scan-records";

const ACCOUNT = "0b8c1d2e-3f4a-4b5c-8d6e-7f8091a2b3c4";
const REPO_ID = "5d1f0c9a-2b3e-4f60-9a71-8b92c3d4e5f6";
const fp = (letter: string) => letter.repeat(64);
const NO_HISTORY = { history: new Map(), triage: new Map(), given: [] };
const BRANCH_ID = "7c2d1e90-4b5a-4c6d-8e7f-9a0b1c2d3e4f";
const BRANCH = { id: BRANCH_ID, name: "main", reason: null };
const NO_BRANCH = { id: null, name: null, reason: '"v1.2.0" is a tag or a commit, not a branch, so this scan has no History' };

const params: ScanParams = {
  scanId: "scan-1",
  accountId: ACCOUNT,
  repo: "https://github.com/octocat/Hello-World",
  options: { skill: "lite", model: "claude-haiku-5-5", effort: "low", profile: "quick", maxBudgetUsd: 1 },
  createdAt: "2026-11-07T00:00:00.000Z",
};

const findingsJson = JSON.stringify([
  {
    id: "F-001",
    status: "confirmed",
    severity: "high",
    title: "Missing owner check",
    class: "authz",
    location: [{ file: "src/routes/user.ts", line: 42 }],
    actor: "a user of tenant A",
    impact: "reads tenant B data",
    evidence: "the query has no tenant filter",
    fix: "add the tenant filter",
    needs: null,
  },
  { id: "F-002", status: "needs_validation", severity: null, title: "Proxy may strip the header", class: "config", location: [], needs: "the proxy config" },
]);

const reportsWith = (findings?: string) => {
  const bindings = fakeBindings();
  if (findings !== undefined) bindings.store.set(`accounts/${ACCOUNT}/scans/scan-1/findings.json`, findings);
  return bindings.env.REPORTS;
};

describe("buildScanRecordSvc", () => {
  it("builds the scan row and one row per finding", async () => {
    const record = await Effect.runPromise(buildScanRecordSvc(reportsWith(findingsJson), params, REPO_ID, BRANCH, "succeeded", null, null, NO_HISTORY));

    expect(record.scan).toMatchObject({
      id: "scan-1",
      tenantId: ACCOUNT,
      status: "succeeded",
      skill: "lite",
      model: "claude-haiku-5-5",
      maxBudgetUsd: "1.00",
      error: null,
    });
    expect(record.scan.finishedAt).toBeInstanceOf(Date);
    expect(record.findings).toHaveLength(2);
    expect(record.findings[0]).toMatchObject({ findingId: "F-001", severity: "high", file: "src/routes/user.ts", line: 42 });
    expect(record.findings[0].fingerprint).toMatch(/^[0-9a-f]{64}$/);
  });

  it("gives a needs_validation finding no severity and no file", async () => {
    const record = await Effect.runPromise(buildScanRecordSvc(reportsWith(findingsJson), params, REPO_ID, BRANCH, "succeeded", null, null, NO_HISTORY));

    expect(record.findings[1]).toMatchObject({ findingId: "F-002", status: "needs_validation", severity: null, file: null, line: null });
  });

  it("records what the agent spent on the scan row", async () => {
    const usage = { inputTokens: 1200, outputTokens: 5400, cacheReadTokens: 250000, cacheWriteTokens: 31000, costUsd: 0.4132, turns: 14, durationMs: 91000 };
    const record = await Effect.runPromise(buildScanRecordSvc(reportsWith(findingsJson), params, REPO_ID, BRANCH, "succeeded", null, usage, NO_HISTORY));

    expect(record.scan).toMatchObject({
      inputTokens: 1200,
      outputTokens: 5400,
      cacheReadTokens: 250000,
      cacheWriteTokens: 31000,
      costUsd: "0.4132",
      turns: 14,
      durationMs: 91000,
    });
  });

  it("leaves the spend empty when the agent reported none", async () => {
    const record = await Effect.runPromise(buildScanRecordSvc(reportsWith(findingsJson), params, REPO_ID, BRANCH, "succeeded", null, null, NO_HISTORY));

    expect(record.scan).toMatchObject({ inputTokens: null, costUsd: null });
  });

  it("records a failed scan with its error and no findings", async () => {
    const record = await Effect.runPromise(buildScanRecordSvc(reportsWith(findingsJson), params, REPO_ID, BRANCH, "failed", "boom", null, NO_HISTORY));

    expect(record.scan).toMatchObject({ status: "failed", error: "boom" });
    expect(record.findings).toEqual([]);
  });

  it("records no findings when findings.json is missing", async () => {
    const record = await Effect.runPromise(buildScanRecordSvc(reportsWith(), params, REPO_ID, BRANCH, "succeeded", null, null, NO_HISTORY));

    expect(record.findings).toEqual([]);
  });

  it("fails with ParseError when findings.json is not valid", async () => {
    const error = await Effect.runPromise(Effect.flip(buildScanRecordSvc(reportsWith("{ not json"), params, REPO_ID, BRANCH, "succeeded", null, null, NO_HISTORY)));

    expect(error._tag).toBe("ParseError");
  });

  it("fails with ParseError when a confirmed finding has no severity", async () => {
    const bad = JSON.stringify([{ id: "F-001", status: "confirmed", severity: null, title: "x", class: "authz" }]);
    const error = await Effect.runPromise(Effect.flip(buildScanRecordSvc(reportsWith(bad), params, REPO_ID, BRANCH, "succeeded", null, null, NO_HISTORY)));

    expect(error._tag).toBe("ParseError");
  });

  it("fails with ExternalError when storage rejects", async () => {
    // SAFETY: the service calls only get on the bucket.
    const reports = { get: async () => Promise.reject(new Error("r2 down")) } as never;
    const error = await Effect.runPromise(Effect.flip(buildScanRecordSvc(reports, params, REPO_ID, BRANCH, "succeeded", null, null, NO_HISTORY)));

    expect(error._tag).toBe("ExternalError");
  });
});

describe("a scan of a tracked branch", () => {
  it("names its branch on the scan row and stamps the history with it", async () => {
    const record = await Effect.runPromise(buildScanRecordSvc(reportsWith(findingsJson), params, REPO_ID, BRANCH, "succeeded", null, null, NO_HISTORY));

    expect(record.scan).toMatchObject({ branch: "main", branchId: BRANCH_ID, untrackedReason: null, priorsGiven: 0 });
    expect(record.history).toHaveLength(2);
    expect(record.history.every((row) => row.branchId === BRANCH_ID)).toBe(true);
  });

  it("does not move the history when it failed", async () => {
    const record = await Effect.runPromise(buildScanRecordSvc(reportsWith(findingsJson), params, REPO_ID, BRANCH, "failed", "boom", null, NO_HISTORY));

    expect(record.history).toEqual([]);
  });
});

describe("recordScanSvc", () => {
  it("does nothing, and does not fail, when DATABASE_URL is not set", async () => {
    const { env } = fakeBindings({ DATABASE_URL: "" });

    await expect(Effect.runPromise(recordScanSvc(env, params, "succeeded", null, null))).resolves.toBeUndefined();
  });
});

describe("a scan with no tracked branch", () => {
  it("records its findings but moves no history and counts no priors", async () => {
    const ref: ScanParams = { ...params, ref: "v1.2.0" };
    const record = await Effect.runPromise(
      buildScanRecordSvc(reportsWith(findingsJson), ref, REPO_ID, NO_BRANCH, "succeeded", null, null, { history: new Map(), triage: new Map(), given: [{ priorId: fp("a"), status: "confirmed", severity: "high", title: "t", class: "authz", file: "src/a.ts", line: 1 }] }),
    );

    expect(record.findings).toHaveLength(2);
    expect(record.findings.every((row) => row.origin === "new")).toBe(true);
    expect(record.history).toEqual([]);
    expect(record.scan).toMatchObject({ ref: "v1.2.0", branch: null, branchId: null, untrackedReason: NO_BRANCH.reason, priorsGiven: null, priorsCarried: null });
  });
});

const fullParams: ScanParams = { ...params, options: { ...params.options, skill: "full" } };

const evidence = (file: string, line: number, description: string) => ({ file, line, description });

const nestedFindings = JSON.stringify([
  {
    verdict: "confirmed",
    fingerprint: "authz/user-route-missing-owner-check",
    title: "Missing owner check",
    description: "A user reads tenant B data",
    severity: { likelihood: { score: "high", reason: "r" }, impact: { score: "critical", reason: "r" }, overall_severity: "critical" },
    evidence: [evidence("src/routes/user.ts", 42, "the query has no tenant filter"), evidence("src/db/user.ts", 7, "the helper takes no tenant")],
    remediation: { strategy: "add the tenant filter", code_changes: [] },
  },
  {
    verdict: "needs_validation",
    fingerprint: "config/proxy-header-strip",
    title: "Proxy may strip the header",
    description: "The header may be lost upstream",
    evidence: [evidence("infra/proxy.conf", 3, "the proxy rewrites headers")],
    validation_plan: { local: "run the proxy with the sample config", deployment: "send one request through staging" },
  },
  { verdict: "rejected", fingerprint: "xss/fake", title: "Not a problem", description: "d", evidence: [evidence("src/a.ts", 1, "e")], reason: "escaped" },
]);

const fullReports = (files: Record<string, string>) => {
  const bindings = fakeBindings();
  for (const [name, text] of Object.entries(files)) bindings.store.set(`accounts/${ACCOUNT}/scans/scan-1/${name}`, text);
  return bindings.env.REPORTS;
};

const recordFull = (files: Record<string, string>, status: "succeeded" | "failed" = "succeeded") =>
  Effect.runPromise(buildScanRecordSvc(fullReports(files), fullParams, REPO_ID, BRANCH, status, null, null, NO_HISTORY));

describe("a profile scan (the full skill)", () => {
  it("records its confirmed and needs_validation findings from the nested shape, and leaves the rejected out", async () => {
    const record = await recordFull({ "findings.json": nestedFindings });

    expect(record.findings).toHaveLength(2);
    expect(record.findings[0]).toMatchObject({
      scanId: "scan-1",
      tenantId: ACCOUNT,
      findingId: "authz/user-route-missing-owner-check",
      fingerprint: "461bd73c626a01a59225326dcbd7803335c647e0b3fc885b791953dfa82864c6",
      status: "confirmed",
      severity: "critical",
      title: "Missing owner check",
      class: "full-audit",
      file: "src/routes/user.ts",
      line: 42,
      actor: null,
      impact: "A user reads tenant B data",
      evidence: "the query has no tenant filter\nthe helper takes no tenant",
      fix: "add the tenant filter",
      needs: null,
    });
    expect(record.findings[1]).toMatchObject({
      findingId: "config/proxy-header-strip",
      fingerprint: "7e3b3315649d3243dc252abc905e4e7578a6ac2ee757172d073e6e1641bc913c",
      status: "needs_validation",
      severity: null,
      file: "infra/proxy.conf",
      line: 3,
      fix: null,
      needs: "Local: run the proxy with the sample config\nDeployment: send one request through staging",
    });
  });

  it("writes no History row and counts no priors", async () => {
    const record = await recordFull({ "findings.json": nestedFindings });

    expect(record.history).toEqual([]);
    expect(record.scan).toMatchObject({ priorsGiven: null, priorsCarried: null, priorsClosed: null, priorsUnchecked: null });
  });

  it("records no rows for a scan that found nothing, and says it was not partial", async () => {
    const record = await recordFull({ "findings.json": "[]", "REPORT.md": "# Report\nNothing found." });

    expect(record.findings).toEqual([]);
    expect(record.scan.partial).toBe(false);
  });

  it("says it was not partial when its output files are missing", async () => {
    const record = await recordFull({});

    expect(record.findings).toEqual([]);
    expect(record.scan.partial).toBe(false);
  });

  it("fails with ParseError when a confirmed record has no severity", async () => {
    const bad = JSON.stringify([{ verdict: "confirmed", fingerprint: "a", title: "t", description: "d", evidence: [evidence("a.ts", 1, "e")] }]);
    const error = await Effect.runPromise(Effect.flip(buildScanRecordSvc(fullReports({ "findings.json": bad }), fullParams, REPO_ID, BRANCH, "succeeded", null, null, NO_HISTORY)));

    expect(error._tag).toBe("ParseError");
  });

  it("leaves the partial column null for a scan that did not succeed", async () => {
    const record = await recordFull({ "findings.json": nestedFindings, "REPORT.md": "PARTIAL: money ran out; 2 units were not covered." }, "failed");

    expect(record.findings).toEqual([]);
    expect(record.scan.partial).toBeNull();
  });
});

const ledger = (...units: Array<{ status: string; unresolved: string[] }>) => JSON.stringify(units);

describe("the partial rule", () => {  it.each([
    ["the Report starts with PARTIAL:", { "REPORT.md": "PARTIAL: money ran out; 3 units were not covered.\n\n- unit-a" }, true],
    ["a unit is deferred for money_exhausted", { "REPORT.md": "# Report", "coverage-ledger.json": ledger({ status: "covered", unresolved: [] }, { status: "deferred", unresolved: ["money_exhausted"] }) }, true],
    ["the Report is clean and the ledger is complete", { "REPORT.md": "# Report", "coverage-ledger.json": ledger({ status: "covered", unresolved: [] }) }, false],
    ["a quick Scan defers a unit for its own profile", { "REPORT.md": "# Report", "coverage-ledger.json": ledger({ status: "deferred", unresolved: ["quick_profile_final_critic"] }) }, false],
    ["PARTIAL: is not on the first line", { "REPORT.md": "# Report\nPARTIAL: later" }, false],
    ["money_exhausted is on a unit that is not deferred", { "REPORT.md": "# Report", "coverage-ledger.json": ledger({ status: "candidate", unresolved: ["money_exhausted"] }) }, false],
  ])("a succeeded scan is partial when %s: %j", async (_name, files, expected) => {
    const record = await recordFull({ "findings.json": "[]", ...files });

    expect(record.scan.partial).toBe(expected);
  });

  it("is not partial when the ledger cannot be read", async () => {
    const record = await recordFull({ "findings.json": "[]", "REPORT.md": "# Report", "coverage-ledger.json": "{ not json" });

    expect(record.scan.partial).toBe(false);
  });

  it("leaves the column null for a lite scan, as before", async () => {
    const record = await Effect.runPromise(buildScanRecordSvc(reportsWith(findingsJson), params, REPO_ID, BRANCH, "succeeded", null, null, NO_HISTORY));

    expect(record.scan.partial).toBeNull();
  });
});

describe("readGivenSvc", () => {
  const prior = { priorId: fp("a"), status: "confirmed", severity: "high", title: "t", class: "authz", file: "src/a.ts", line: 1 };
  const reportsHolding = (content?: string) => {
    const bindings = fakeBindings();
    if (content !== undefined) bindings.store.set(`accounts/${ACCOUNT}/scans/scan-1/prior-findings.json`, content);
    return bindings.env.REPORTS;
  };

  it("returns the list that was saved when the scan launched, and none when nothing was saved", async () => {
    expect(await Effect.runPromise(readGivenSvc(reportsHolding(JSON.stringify([prior])), params))).toEqual([prior]);
    expect(await Effect.runPromise(readGivenSvc(reportsHolding(), params))).toEqual([]);
  });

  it("fails on a saved list it cannot read, so a retry reads it again instead of judging against nothing", async () => {
    const error = await Effect.runPromise(Effect.flip(readGivenSvc(reportsHolding("{ not json"), params)));

    expect(error._tag).toBe("ExternalError");
  });
});
