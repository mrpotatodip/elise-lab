import { eq } from "drizzle-orm";
import { Effect } from "effect";
import { scanFindings, scans } from "@repo/db-elise/schema";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { fakeBindings } from "#/__tests__/fake-bindings";
import { openTestDb, seedTenant, type TestDb } from "#/__tests__/test-db";
import type { ScanParams } from "#/schemas";
import { neonScanRepo } from "#/modules/scan-ledger";
import { buildScanRecordSvc } from "#/modules/scan-records";
import { writeScanRecordEffect } from "#/modules/scan-records/queries";

let test: TestDb;
let tenantId: string;
let repoId: string;

const REPO = "https://github.com/octocat/Hello-World";
const options = { skill: "full", model: "claude-haiku-5-5", effort: "low", profile: "quick", maxBudgetUsd: 1 } as const;
const run = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(effect);

beforeAll(async () => {
  test = await openTestDb();
  tenantId = (await seedTenant(test, "acme")).tenantId;
  repoId = (await run(neonScanRepo(test.http).ensureRepo(tenantId, REPO))).id;
});

afterAll(async () => {
  await test.close();
});

describe("writing a scan record", () => {
  it("saves nothing at all when one write in the record fails", async () => {
    const params: ScanParams = { scanId: "s-5", accountId: tenantId, repo: REPO, options, createdAt: new Date().toISOString() };
    await run(neonScanRepo(test.http).create(params, repoId, Date.now()));
    const bad = await run(buildScanRecordSvc(fakeBindings().env.REPORTS, params, repoId, { id: null, name: null, reason: null }, "succeeded", null, null));
    // SAFETY: a severity outside the allowed list, to make the findings insert fail its check constraint.
    bad.findings.push({ tenantId, scanId: "s-5", findingId: "F-001", fingerprint: "y".repeat(64), status: "confirmed", severity: "nonsense" as never, title: "t", class: "c" });

    const error = await Effect.runPromise(Effect.flip(writeScanRecordEffect(test.http, bad)));

    expect(error._tag).toBe("DbError");
    expect((await test.raw.select({ status: scans.status }).from(scans).where(eq(scans.id, "s-5")))[0].status).toBe("queued");
    expect(await test.raw.select().from(scanFindings).where(eq(scanFindings.scanId, "s-5"))).toEqual([]);
    await run(neonScanRepo(test.http).mark(tenantId, "s-5", { status: "failed", error: "closed by the test" }));
  });
});

describe("the partial flag on a Runner scan's row", () => {
  const RUNNER_ID = "3f2a9c1e-5b7d-4e86-9a0c-1d2e3f4a5b6c";

  const recordRunnerScan = async (scanId: string, files: Record<string, string>) => {
    const params: ScanParams = { scanId, accountId: tenantId, repo: REPO, options: { ...options, skill: "full" }, runnerId: RUNNER_ID, createdAt: new Date().toISOString() };
    await run(neonScanRepo(test.http).create(params, repoId, Date.now()));
    const bindings = fakeBindings();
    for (const [name, text] of Object.entries(files)) bindings.store.set(`accounts/${tenantId}/scans/${scanId}/${name}`, text);
    const record = await run(buildScanRecordSvc(bindings.env.REPORTS, params, repoId, { id: null, name: null, reason: null }, "succeeded", null, null));
    await run(writeScanRecordEffect(test.http, record));
    return (await test.raw.select({ partial: scans.partial }).from(scans).where(eq(scans.id, scanId)))[0].partial;
  };

  it.each([
    ["a PARTIAL: line for something the agent could not verify", "runner-partial-other", { "findings.json": "[]", "REPORT.md": "PARTIAL: I could not verify." }, false],
    ["a PARTIAL: money ran out; line", "runner-partial-money", { "findings.json": "[]", "REPORT.md": "PARTIAL: money ran out; 2 units were not covered." }, true],
    ["incomplete_reason money_exhausted in run-metadata.json", "runner-partial-metadata", { "findings.json": "[]", "REPORT.md": "# Report", "run-metadata.json": JSON.stringify({ run_status: "incomplete", incomplete_reason: "money_exhausted" }) }, true],
  ])("stores partial for %s", async (_name, scanId, files, expected) => {
    expect(await recordRunnerScan(scanId, files)).toBe(expected);
  });
});

const metadataOf = (profile: string) => JSON.stringify({ run_id: "run-1", profile, run_status: "complete" });

describe("the profile met on a Runner scan's row", () => {
  const RUNNER_ID = "3f2a9c1e-5b7d-4e86-9a0c-1d2e3f4a5b6c";

  const hunted = { status: "covered", agent_id: "hunter-inline", wave: 1, attempts: [], local_checks: [{ agent_id: "hunter-inline" }], result_fingerprints: [], unresolved: [] };
  const deferredByCritic = { status: "deferred", agent_id: null, wave: 1, attempts: [], local_checks: [], result_fingerprints: [], unresolved: ["quick_profile_final_critic: needs node_modules"] };

  const FOCUSED_OLD_SKILL = { "findings.json": "[]", "REPORT.md": "# Report", "coverage-ledger.json": JSON.stringify([hunted, hunted, deferredByCritic]), "run-metadata.json": metadataOf("quick") };
  const NO_CRITIC = { ...FOCUSED_OLD_SKILL, "coverage-ledger.json": JSON.stringify([hunted]) };
  const NO_LEDGER = { "findings.json": "[]", "REPORT.md": "# Report", "run-metadata.json": metadataOf("quick") };

  const recordedProfileMet = async (
    scanId: string,
    asked: "quick" | "standard" | "deep",
    files: Record<string, string>,
    over: { cloud?: boolean; status?: "succeeded" | "failed" } = {},
  ) => {
    const params: ScanParams = { scanId, accountId: tenantId, repo: REPO, options: { ...options, skill: "full", profile: asked }, createdAt: new Date().toISOString() };
    if (!over.cloud) params.runnerId = RUNNER_ID;
    await run(neonScanRepo(test.http).create(params, repoId, Date.now()));
    const bindings = fakeBindings();
    for (const [name, text] of Object.entries(files)) bindings.store.set(`accounts/${tenantId}/scans/${scanId}/${name}`, text);
    const record = await run(buildScanRecordSvc(bindings.env.REPORTS, params, repoId, { id: null, name: null, reason: null }, over.status ?? "succeeded", null, null));
    await run(writeScanRecordEffect(test.http, record));
    return (await test.raw.select({ profileMet: scans.profileMet }).from(scans).where(eq(scans.id, scanId)))[0].profileMet;
  };

  it.each([
    ["met: a Focused Scan that did Focused work stores quick (an older app's single prompt, old Skill)", "pm-met", "quick", FOCUSED_OLD_SKILL, "quick"],
    ["lesser: an Exhaustive Scan whose files show Balanced work stores standard", "pm-lesser", "deep", FOCUSED_OLD_SKILL, "standard"],
    ["unmet: a Focused Scan with no critic pass stores none", "pm-unmet", "quick", NO_CRITIC, "none"],
    ["unmet: a result with no ledger stores none", "pm-no-ledger", "quick", NO_LEDGER, "none"],
    ["not checked: a Partial Scan stores null", "pm-partial", "quick", { ...FOCUSED_OLD_SKILL, "REPORT.md": "PARTIAL: money ran out; 2 units were not covered." }, null],
  ] as const)("%s", async (_name, scanId, asked, files, expected) => {
    expect(await recordedProfileMet(scanId, asked, files)).toBe(expected);
  });

  it("stores null for a cloud Scan, whatever files it wrote", async () => {
    expect(await recordedProfileMet("pm-cloud", "quick", FOCUSED_OLD_SKILL, { cloud: true })).toBeNull();
  });

  it("stores null for a Runner Scan that did not succeed", async () => {
    expect(await recordedProfileMet("pm-failed", "quick", FOCUSED_OLD_SKILL, { status: "failed" })).toBeNull();
  });
});
