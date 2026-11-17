import { eq } from "drizzle-orm";
import { Effect } from "effect";
import { scanFindingTriage, scanRepoFindings, scanRepoBranches, scans } from "@repo/db-elise/schema";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { fakeBindings } from "#/__tests__/fake-bindings";
import { openTestDb, seedRepo, seedTenant, type TestDb } from "#/__tests__/test-db";
import { resolveScanBranchEffect } from "#/modules/branches";
import { addBranchSvc, listRepoFindingsSvc } from "#/modules/repos/handlers";
import { listRepoBranchesEffect, listReposEffect } from "#/modules/repos/queries";
import type { ScanParams } from "#/schemas";
import { buildScanRecordSvc } from "#/modules/scan-records";
import { writeScanRecordEffect } from "#/modules/scan-records/queries";

let test: TestDb;
let tenantId: string;
let repoId: string;
let tick = 0;
let accounts = 0;

const REPO = "https://github.com/octocat/Hello-World";
const run = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(effect);
const EVIDENCE = [{ file: "src/a.ts", line: 1, description: "the query has no tenant filter" }];

const confirmed = (id: string, title: string, severity: "critical" | "high" | "medium" | "low" = "high") => ({
  verdict: "confirmed",
  fingerprint: id,
  title,
  description: "reads another tenant's data",
  severity: { overall_severity: severity },
  evidence: EVIDENCE,
  remediation: { strategy: "add the tenant filter" },
});
const needsValidation = (id: string, title: string) => ({ verdict: "needs_validation", fingerprint: id, title, description: "maybe", evidence: EVIDENCE, validation_plan: { local: "run it" } });
const rejected = (id: string) => ({ verdict: "rejected", fingerprint: id, title: "noise", description: "escaped", evidence: EVIDENCE, reason: "escaped" });

type Read = { name: string | null; ref: string | null };
type Saved = { findings?: unknown[]; profile?: "quick" | "standard" | "deep"; read?: Read; status?: "succeeded" | "failed"; report?: string; commit?: string };

// -----
// Records a Scan the way the workflow does: find the Branch it
// read, build the record from the files the agent wrote, write it.
// No Scan reads or writes the History.
// -----
const ownId = (name: string) => `a${accounts}-${name}`;
const plainId = (id: string) => id.slice(ownId("").length);

const recordScan = async (name: string, saved: Saved = {}) => {
  tick += 1;
  const scanId = ownId(name);
  const read = saved.read ?? { name: "main", ref: null };
  const status = saved.status ?? "succeeded";
  const params: ScanParams = {
    scanId,
    accountId: tenantId,
    repo: REPO,
    ref: read.ref ?? undefined,
    options: { skill: "full", model: "claude-haiku-5-5", effort: "low", profile: saved.profile ?? "standard", maxBudgetUsd: 1 },
    createdAt: new Date(Date.UTC(2026, 10, 1, 0, tick)).toISOString(),
  };
  const outcome = status === "succeeded" ? await run(resolveScanBranchEffect(test.http, tenantId, repoId, read)) : { id: null, reason: null };
  const bindings = fakeBindings();
  bindings.store.set(`accounts/${tenantId}/scans/${scanId}/findings.json`, JSON.stringify(saved.findings ?? []));
  if (saved.report) bindings.store.set(`accounts/${tenantId}/scans/${scanId}/REPORT.md`, saved.report);
  const record = await run(buildScanRecordSvc(bindings.env.REPORTS, params, repoId, { ...outcome, name: outcome.name ?? read.name }, status, null, null));
  await run(writeScanRecordEffect(test.http, record));
  await test.raw.update(scans).set({ commitSha: saved.commit ?? `${scanId}-sha` }).where(eq(scans.id, scanId));
};

const listed = async (branch?: string) => (await run(listRepoFindingsSvc(test.http, tenantId, repoId, { limit: 50, branch }))).findings;
const seen = async (branch?: string) =>
  (await listed(branch)).map((finding) => ({ title: finding.title, state: finding.state, unchecked: finding.unchecked, first: plainId(finding.firstSeenScanId), last: plainId(finding.scanId) })).toSorted((a, b) => a.title.localeCompare(b.title));
const titlesOf = async (branch?: string) => (await listed(branch)).map((finding) => finding.title).toSorted();
const mainBranch = async () => (await run(listRepoBranchesEffect(test.http, tenantId, repoId))).find((branch) => branch.name === "main");

beforeAll(async () => {
  test = await openTestDb();
});

beforeEach(async () => {
  accounts += 1;
  tenantId = (await seedTenant(test, `acme-${accounts}`)).tenantId;
  repoId = await seedRepo(test, tenantId);
});

afterAll(async () => {
  await test.close();
});

describe("a Branch's findings are the merge of its Scans", () => {
  it("lists what one Scan found, and the open counts match the list", async () => {
    await recordScan("s1", { findings: [confirmed("a", "problem a", "high"), confirmed("b", "problem b", "medium"), needsValidation("c", "problem c")] });

    expect(await seen()).toEqual([
      { title: "problem a", state: "open", unchecked: false, first: "s1", last: "s1" },
      { title: "problem b", state: "open", unchecked: false, first: "s1", last: "s1" },
      { title: "problem c", state: "open", unchecked: false, first: "s1", last: "s1" },
    ]);
    expect((await mainBranch())?.open).toEqual({ total: 3, severity: { critical: 0, high: 1, medium: 1, low: 0, informational: 0 }, needsValidation: 1, regressed: 0, unchecked: 0 });
  });

  it("keeps a problem the next Scan missed, open and not in the latest Scan, beside the one it found again and the one it added", async () => {
    await recordScan("s1", { findings: [confirmed("a", "problem a"), confirmed("b", "problem b")] });
    await recordScan("s2", { findings: [confirmed("a", "problem a reworded"), confirmed("c", "problem c")] });

    expect(await seen()).toEqual([
      { title: "problem a reworded", state: "open", unchecked: false, first: "s1", last: "s2" },
      { title: "problem b", state: "open", unchecked: true, first: "s1", last: "s1" },
      { title: "problem c", state: "open", unchecked: false, first: "s2", last: "s2" },
    ]);
    expect((await mainBranch())?.open).toMatchObject({ total: 3, unchecked: 1 });
  });

  it("hides nothing when a shallower Scan follows a deeper one", async () => {
    await recordScan("deep", { profile: "deep", findings: [confirmed("a", "problem a"), confirmed("b", "problem b"), confirmed("c", "problem c")] });
    await recordScan("quick", { profile: "quick", findings: [confirmed("a", "problem a")] });

    expect(await titlesOf()).toEqual(["problem a", "problem b", "problem c"]);
    expect((await mainBranch())?.open).toMatchObject({ total: 3, unchecked: 2 });
  });

  it("lists a problem two Scans saved under one fingerprint once, from its oldest to its newest Scan", async () => {
    await recordScan("s1", { findings: [confirmed("a", "first words")] });
    await recordScan("s2", { findings: [confirmed("b", "problem b")] });
    await recordScan("s3", { findings: [confirmed("a", "newest words", "critical")] });

    const found = (await listed()).filter((finding) => finding.title !== "problem b");

    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ title: "newest words", severity: "critical", firstSeenScanId: ownId("s1"), scanId: ownId("s3") });
  });

  it("keeps a person's decision when a new Scan sees the problem again, and leaves it out of the open counts", async () => {
    await recordScan("s1", { findings: [confirmed("a", "problem a"), confirmed("b", "problem b")] });
    const [decided] = (await listed()).filter((finding) => finding.title === "problem a");
    await test.raw.insert(scanFindingTriage).values({ tenantId, repoId, fingerprint: decided.fingerprint, status: "false_positive" });
    await recordScan("s2", { findings: [confirmed("a", "problem a"), confirmed("b", "problem b")] });

    const after = (await listed()).find((finding) => finding.title === "problem a");

    expect(after).toMatchObject({ scanId: ownId("s2"), triage: { status: "false_positive" } });
    expect((await mainBranch())?.open.total).toBe(1);
  });

  it("adds nothing for a failed Scan, a Scan of a tag or of an old commit, or a rejected record", async () => {
    await recordScan("s1", { findings: [confirmed("a", "problem a"), rejected("x")] });
    await recordScan("failed", { status: "failed", findings: [confirmed("f", "failed problem")] });
    await recordScan("tag", { read: { name: null, ref: "v1.0.0" }, findings: [confirmed("t", "tag problem")] });
    await recordScan("old", { read: { name: null, ref: "1".repeat(40) }, findings: [confirmed("o", "old commit problem")] });

    expect(await titlesOf()).toEqual(["problem a"]);
    expect((await mainBranch())?.open.total).toBe(1);
  });

  it("counts a Scan of the commit that is the latest of one Branch, and not of one that is the latest of two", async () => {
    const tip = "2".repeat(40);
    await recordScan("main-1", { commit: tip, findings: [confirmed("a", "problem a")] });
    await recordScan("by-commit", { read: { name: null, ref: tip }, commit: tip, findings: [confirmed("b", "found by commit")] });
    await run(addBranchSvc(test.http, test.pool, tenantId, repoId, { name: "release" }));
    await recordScan("release-1", { read: { name: "release", ref: "release" }, commit: tip, findings: [confirmed("r", "release problem")] });
    await recordScan("by-shared-commit", { read: { name: null, ref: tip }, commit: tip, findings: [confirmed("s", "found by shared commit")] });

    expect(await titlesOf()).toEqual(["found by commit", "problem a"]);
    expect(await titlesOf("release")).toEqual(["release problem"]);
  });

  it("adds what a Partial Scan confirmed", async () => {
    await recordScan("partial", { report: "PARTIAL: money ran out; 3 units were not covered.", findings: [confirmed("a", "problem a")] });

    expect(await titlesOf()).toEqual(["problem a"]);
    expect((await test.raw.select({ partial: scans.partial }).from(scans).where(eq(scans.id, ownId("partial"))))[0].partial).toBe(true);
  });

  it("keeps a problem the older path closed closed, and shows one it recorded as regressed as back", async () => {
    await recordScan("s1", { findings: [confirmed("a", "problem a"), confirmed("b", "problem b"), confirmed("c", "problem c")] });
    await recordScan("s2", { findings: [confirmed("a", "problem a"), confirmed("b", "problem b"), confirmed("c", "problem c")] });
    const byTitle = new Map((await listed()).map((finding) => [finding.title, finding.fingerprint]));
    const [branch] = await test.raw.select({ id: scanRepoBranches.id }).from(scanRepoBranches).where(eq(scanRepoBranches.repoId, repoId));
    const row = { tenantId, repoId, branchId: branch.id, firstSeenScanId: ownId("s1"), lastSeenScanId: ownId("s2") } as const;
    await test.raw.insert(scanRepoFindings).values([
      { ...row, fingerprint: byTitle.get("problem a") ?? "", state: "fixed_by_code", fixedInScanId: ownId("s2") },
      { ...row, fingerprint: byTitle.get("problem b") ?? "", state: "regressed" },
    ]);

    expect((await seen()).map((finding) => [finding.title, finding.state])).toEqual([
      ["problem a", "fixed_by_code"],
      ["problem b", "regressed"],
      ["problem c", "open"],
    ]);
    expect((await mainBranch())?.open).toMatchObject({ total: 2, regressed: 1 });
  });

  it("gives the same open count on the Branch, on the repository list and in the list itself", async () => {
    await recordScan("s1", { findings: [confirmed("a", "problem a", "critical"), confirmed("b", "problem b", "low"), needsValidation("c", "problem c")] });
    await recordScan("s2", { findings: [confirmed("a", "problem a", "critical"), confirmed("d", "problem d", "medium")] });
    const [decided] = (await listed()).filter((finding) => finding.title === "problem b");
    await test.raw.insert(scanFindingTriage).values({ tenantId, repoId, fingerprint: decided.fingerprint, status: "fixed" });

    const [repo] = await run(listReposEffect(test.http, tenantId));
    const branch = await mainBranch();
    const unresolved = (await listed()).filter((finding) => !finding.triage || finding.triage.status === "open");

    expect(repo.open).toEqual(branch?.open);
    expect(repo.open).toMatchObject({ total: 3, unchecked: 1, needsValidation: 1 });
    expect(unresolved).toHaveLength(repo.open.total);
  });
});
