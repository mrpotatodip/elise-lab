import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import { fakeBindings } from "#/__tests__/fake-bindings";
import type { ScanParams } from "#/schemas";
import { buildScanRecordSvc, recordScanSvc } from "#/modules/scan-records";

const ACCOUNT = "0b8c1d2e-3f4a-4b5c-8d6e-7f8091a2b3c4";
const REPO_ID = "5d1f0c9a-2b3e-4f60-9a71-8b92c3d4e5f6";
const BRANCH_ID = "7c2d1e90-4b5a-4c6d-8e7f-9a0b1c2d3e4f";
const BRANCH = { id: BRANCH_ID, name: "main", reason: null };
const NO_BRANCH = { id: null, name: null, reason: '"v1.2.0" is a tag or a commit, not a branch, so this scan has no History' };

const params: ScanParams = {
  scanId: "scan-1",
  accountId: ACCOUNT,
  repo: "https://github.com/octocat/Hello-World",
  options: { skill: "full", model: "claude-haiku-5-5", effort: "low", profile: "quick", maxBudgetUsd: 1 },
  createdAt: "2026-11-07T00:00:00.000Z",
};

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

const reportsWith = (files: Record<string, string>) => {
  const bindings = fakeBindings();
  for (const [name, text] of Object.entries(files)) bindings.store.set(`accounts/${ACCOUNT}/scans/scan-1/${name}`, text);
  return bindings.env.REPORTS;
};

const recordFull = (files: Record<string, string>, status: "succeeded" | "failed" = "succeeded", error: string | null = null) =>
  Effect.runPromise(buildScanRecordSvc(reportsWith(files), params, REPO_ID, BRANCH, status, error, null));

describe("buildScanRecordSvc", () => {
  it("records its confirmed and needs_validation findings from the nested shape, and leaves the rejected out", async () => {
    const record = await recordFull({ "findings.json": nestedFindings });

    expect(record.scan).toMatchObject({ id: "scan-1", tenantId: ACCOUNT, status: "succeeded", skill: "full", model: "claude-haiku-5-5", maxBudgetUsd: "1.00", error: null });
    expect(record.scan.finishedAt).toBeInstanceOf(Date);
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

  it("records what the agent spent on the scan row", async () => {
    const usage = { inputTokens: 1200, outputTokens: 5400, cacheReadTokens: 250000, cacheWriteTokens: 31000, costUsd: 0.4132, turns: 14, durationMs: 91000 };
    const record = await Effect.runPromise(buildScanRecordSvc(reportsWith({ "findings.json": nestedFindings }), params, REPO_ID, BRANCH, "succeeded", null, usage));

    expect(record.scan).toMatchObject({ inputTokens: 1200, outputTokens: 5400, cacheReadTokens: 250000, cacheWriteTokens: 31000, costUsd: "0.4132", turns: 14, durationMs: 91000 });
  });

  it("leaves the spend empty when the agent reported none", async () => {
    const record = await recordFull({ "findings.json": nestedFindings });

    expect(record.scan).toMatchObject({ inputTokens: null, costUsd: null });
  });

  it("records a failed scan with its error and no findings", async () => {
    const record = await recordFull({ "findings.json": nestedFindings }, "failed", "boom");

    expect(record.scan).toMatchObject({ status: "failed", error: "boom" });
    expect(record.findings).toEqual([]);
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

  it("fails with ParseError when findings.json is not valid", async () => {
    const error = await Effect.runPromise(Effect.flip(buildScanRecordSvc(reportsWith({ "findings.json": "{ not json" }), params, REPO_ID, BRANCH, "succeeded", null, null)));

    expect(error._tag).toBe("ParseError");
  });

  it("fails with ParseError when a confirmed record has no severity", async () => {
    const bad = JSON.stringify([{ verdict: "confirmed", fingerprint: "a", title: "t", description: "d", evidence: [evidence("a.ts", 1, "e")] }]);
    const error = await Effect.runPromise(Effect.flip(buildScanRecordSvc(reportsWith({ "findings.json": bad }), params, REPO_ID, BRANCH, "succeeded", null, null)));

    expect(error._tag).toBe("ParseError");
  });

  it("fails with ExternalError when storage rejects", async () => {
    // SAFETY: the service calls only get on the bucket.
    const reports = { get: async () => Promise.reject(new Error("r2 down")) } as never;
    const error = await Effect.runPromise(Effect.flip(buildScanRecordSvc(reports, params, REPO_ID, BRANCH, "succeeded", null, null)));

    expect(error._tag).toBe("ExternalError");
  });

  it("leaves the partial column null for a scan that did not succeed", async () => {
    const record = await recordFull({ "findings.json": nestedFindings, "REPORT.md": "PARTIAL: money ran out; 2 units were not covered." }, "failed");

    expect(record.findings).toEqual([]);
    expect(record.scan.partial).toBeNull();
  });

  it("records the scan row of the older skill without reading its findings", async () => {
    const older: ScanParams = { ...params, options: { ...params.options, skill: "lite" } };
    const record = await Effect.runPromise(buildScanRecordSvc(reportsWith({ "findings.json": "[{ \"id\": \"F-001\" }]" }), older, REPO_ID, BRANCH, "succeeded", null, null));

    expect(record.scan).toMatchObject({ skill: "lite", status: "succeeded", partial: null });
    expect(record.findings).toEqual([]);
  });
});

describe("the branch on a scan row", () => {
  it("names the branch it belongs to", async () => {
    const record = await recordFull({ "findings.json": nestedFindings });

    expect(record.scan).toMatchObject({ branch: "main", branchId: BRANCH_ID, untrackedReason: null });
  });

  it("records the findings of a scan with no tracked branch and says why it has none", async () => {
    const ref: ScanParams = { ...params, ref: "v1.2.0" };
    const record = await Effect.runPromise(buildScanRecordSvc(reportsWith({ "findings.json": nestedFindings }), ref, REPO_ID, NO_BRANCH, "succeeded", null, null));

    expect(record.findings).toHaveLength(2);
    expect(record.scan).toMatchObject({ ref: "v1.2.0", branch: null, branchId: null, untrackedReason: NO_BRANCH.reason });
  });
});

describe("recordScanSvc", () => {
  it("does nothing, and does not fail, when DATABASE_URL is not set", async () => {
    const { env } = fakeBindings({ DATABASE_URL: "" });

    await expect(Effect.runPromise(recordScanSvc(env, params, "succeeded", null, null))).resolves.toBeUndefined();
  });
});

const ledger = (...units: Array<{ status: string; unresolved: string[] }>) => JSON.stringify(units);
const metadata = (fields: Record<string, string>) => JSON.stringify({ run_id: "r1", profile: "deep", ...fields });

describe("the partial rule", () => {
  it.each([
    ["the Report starts with PARTIAL:", { "REPORT.md": "PARTIAL: money ran out; 3 units were not covered.\n\n- unit-a" }, true],
    ["a unit is deferred for money_exhausted", { "REPORT.md": "# Report", "coverage-ledger.json": ledger({ status: "covered", unresolved: [] }, { status: "deferred", unresolved: ["money_exhausted"] }) }, true],
    ["the Report is clean and the ledger is complete", { "REPORT.md": "# Report", "coverage-ledger.json": ledger({ status: "covered", unresolved: [] }) }, false],
    ["a quick Scan defers a unit for its own profile", { "REPORT.md": "# Report", "coverage-ledger.json": ledger({ status: "deferred", unresolved: ["quick_profile_final_critic"] }) }, false],
    ["PARTIAL: is not on the first line", { "REPORT.md": "# Report\nPARTIAL: later" }, false],
    ["an unvalidated candidate is kept as a candidate unit with money_exhausted", { "REPORT.md": "# Report", "coverage-ledger.json": ledger({ status: "candidate", unresolved: ["money_exhausted"] }) }, true],
    ["a blank line comes before PARTIAL:", { "REPORT.md": "\n\nPARTIAL: money ran out; 1 unit was not covered." }, true],
    ["the agent wrote its own PARTIAL: line for something it could not verify", { "REPORT.md": "PARTIAL: I could not verify the findings.\n\n- F-001" }, false],
    ["the agent wrote its own PARTIAL: line and its metadata says verification was unavailable", { "REPORT.md": "PARTIAL: no node command.", "run-metadata.json": metadata({ run_status: "incomplete", incomplete_reason: "verification_unavailable" }) }, false],
    ["run-metadata.json says the money ran out", { "REPORT.md": "# Report", "run-metadata.json": metadata({ run_status: "incomplete", incomplete_reason: "money_exhausted" }) }, true],
    ["run-metadata.json says a run completed", { "REPORT.md": "# Report", "run-metadata.json": metadata({ run_status: "complete" }) }, false],
    ["run-metadata.json cannot be read", { "REPORT.md": "# Report", "run-metadata.json": "{ not json" }, false],
  ])("a succeeded scan is partial when %s: %j", async (_name, files, expected) => {
    const record = await recordFull({ "findings.json": "[]", ...files });

    expect(record.scan.partial).toBe(expected);
  });

  it("is not partial when the ledger cannot be read", async () => {
    const record = await recordFull({ "findings.json": "[]", "REPORT.md": "# Report", "coverage-ledger.json": "{ not json" });

    expect(record.scan.partial).toBe(false);
  });
});
