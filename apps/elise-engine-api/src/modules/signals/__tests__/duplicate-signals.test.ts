import { and, eq } from "drizzle-orm";
import { Effect } from "effect";
import { scanFindings, scanSignals, scans, tenants } from "@repo/db-elise/schema";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { fakeBindings } from "#/__tests__/fake-bindings";
import { fakeTypeSafe } from "#/__tests__/fake-typesafe";
import { openTestDb, seedRepo, seedTenant, type TestDb } from "#/__tests__/test-db";
import { resolveScanBranchEffect } from "#/modules/branches";
import { detectDuplicateSignalsSvc } from "#/modules/signals";
import { SIGNAL_DUPLICATE_PAIR_CAP } from "#/modules/signals/constants";
import { duplicatePairsOf } from "#/modules/signals/utils";
import { buildScanRecordSvc } from "#/modules/scan-records";
import { writeScanRecordEffect } from "#/modules/scan-records/queries";
import type { TypeSafeGateway } from "#/modules/typesafe";
import type { ScanParams } from "#/schemas";

let test: TestDb;
let tenantId: string;
let repoId: string;
let tick = 0;
let accounts = 0;

const REPO = "https://github.com/octocat/Hello-World";
const run = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(effect);

const confirmed = (id: string, title: string, file = "src/a.ts", cls = "injection") => ({
  verdict: "confirmed",
  fingerprint: id,
  title,
  class: cls,
  description: "reads another tenant's data",
  severity: { overall_severity: "high" },
  evidence: [{ file, line: 1, description: "the query has no tenant filter" }],
  remediation: { strategy: "add the tenant filter" },
});

const recordScan = async (
  name: string,
  findings: unknown[],
  read: { name: string | null; ref: string | null } = { name: "main", ref: null },
) => {
  tick += 1;
  const scanId = `a${accounts}-${name}`;
  const params: ScanParams = {
    scanId,
    accountId: tenantId,
    repo: REPO,
    ref: read.ref ?? undefined,
    options: { skill: "full", model: "claude-haiku-5-5", effort: "low", profile: "standard", maxBudgetUsd: 1 },
    createdAt: new Date(Date.UTC(2026, 10, 1, 0, tick)).toISOString(),
  };
  const outcome = await run(resolveScanBranchEffect(test.http, tenantId, repoId, read));
  const bindings = fakeBindings();
  bindings.store.set(`accounts/${tenantId}/scans/${scanId}/findings.json`, JSON.stringify(findings));
  const record = await run(
    buildScanRecordSvc(
      bindings.env.REPORTS,
      params,
      repoId,
      { ...outcome, name: outcome.name ?? read.name },
      "succeeded",
      null,
      null,
    ),
  );
  await run(writeScanRecordEffect(test.http, record));
  return scanId;
};

const detect = (scanId: string, gateway: TypeSafeGateway | null) =>
  run(detectDuplicateSignalsSvc(test.http, gateway, tenantId, scanId));
const stored = () => test.raw.select().from(scanSignals).where(eq(scanSignals.tenantId, tenantId));
const fingerprintOf = async (title: string) =>
  (
    await test.raw
      .select({ fingerprint: scanFindings.fingerprint })
      .from(scanFindings)
      .where(and(eq(scanFindings.tenantId, tenantId), eq(scanFindings.title, title)))
  )[0]?.fingerprint;
const skippedOf = async (scanId: string) =>
  (
    await test.raw
      .select({ skipped: scans.signalPairsSkipped })
      .from(scans)
      .where(and(eq(scans.id, scanId), eq(scans.tenantId, tenantId)))
  )[0]?.skipped;

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

const f = (fingerprint: string, file: string | null, cls: string) => ({ fingerprint, file, class: cls });

describe("duplicatePairsOf", () => {
  it("pairs findings that share a file or a class, once each, and never a finding with itself", () => {
    const fresh = [f("a", "x.ts", "sqli"), f("b", "y.ts", "xss")];
    const open = [f("a", "x.ts", "sqli"), f("b", "y.ts", "xss"), f("c", "x.ts", "other"), f("d", "z.ts", "xss")];

    const { asked, skipped } = duplicatePairsOf(fresh, open, new Set(), 10);

    expect(asked).toEqual([
      { fingerprint: "a", other: "c" },
      { fingerprint: "b", other: "d" },
    ]);
    expect(skipped).toBe(0);
  });

  it("asks a pair of two new findings once, and not a pair that already has a signal", () => {
    const both = [f("a", "x.ts", "sqli"), f("b", "x.ts", "sqli")];
    expect(duplicatePairsOf(both, both, new Set(), 10).asked).toEqual([{ fingerprint: "a", other: "b" }]);
    expect(duplicatePairsOf(both, both, new Set(["a|b"]), 10).asked).toEqual([]);
  });

  it("asks the first pairs up to the cap and counts the rest", () => {
    const fresh = [f("n", null, "sqli")];
    const open = ["a", "b", "c", "d", "e"].map((id) => f(id, null, "sqli"));

    const { asked, skipped } = duplicatePairsOf(fresh, open, new Set(), 3);

    expect(asked).toHaveLength(3);
    expect(skipped).toBe(2);
  });
});

describe("detectDuplicateSignalsSvc", () => {
  it("stores a Signal for a new finding and an open one that the model says are the same, and nothing for a no", async () => {
    await recordScan("s1", [confirmed("old", "tenant filter missing in orders")]);
    const next = await recordScan("s2", [
      confirmed("old", "tenant filter missing in orders"),
      confirmed("new", "orders query lacks tenant scope"),
    ]);
    const fake = fakeTypeSafe(0.9);

    await detect(next, fake.gateway);

    expect(fake.calls).toHaveLength(1);
    expect(await stored()).toMatchObject([
      {
        fingerprint: await fingerprintOf("orders query lacks tenant scope"),
        relatedFingerprint: await fingerprintOf("tenant filter missing in orders"),
        kind: "possible_duplicate",
        probability: 0.9,
        modelVersion: "jev-fake",
      },
    ]);
    expect(await skippedOf(next)).toBe(0);

    const none = fakeTypeSafe(0.4);
    const third = await recordScan("s3", [confirmed("old", "x"), confirmed("new", "y"), confirmed("newer", "z")]);
    await detect(third, none.gateway);
    expect(await stored()).toHaveLength(1);
  });

  it("sends Finding words and no source code", async () => {
    await recordScan("s1", [confirmed("old", "tenant filter missing")]);
    const next = await recordScan("s2", [confirmed("new", "orders lack tenant scope")]);
    const fake = fakeTypeSafe(0.1);

    await detect(next, fake.gateway);

    expect(fake.calls[0]?.state).toMatchObject({
      a: { title: expect.any(String), file: "src/a.ts" },
      b: { title: expect.any(String), file: "src/a.ts" },
    });
    expect(JSON.stringify(fake.calls[0])).toContain("tenant filter missing");
  });

  it("caps the pairs of one Scan and stores how many it skipped", async () => {
    const olds = Array.from({ length: SIGNAL_DUPLICATE_PAIR_CAP + 3 }, (_, i) =>
      confirmed(`old-${String(i).padStart(2, "0")}`, `old ${i}`, "src/a.ts"),
    );
    await recordScan("s1", olds);
    const next = await recordScan("s2", [...olds, confirmed("new", "fresh", "src/a.ts")]);
    const fake = fakeTypeSafe(0.1);

    await detect(next, fake.gateway);

    expect(fake.calls).toHaveLength(SIGNAL_DUPLICATE_PAIR_CAP);
    expect(await skippedOf(next)).toBe(3);
  });

  it("asks nothing when Signals are off, when there is no key, or when the Scan has no Branch", async () => {
    await recordScan("s1", [confirmed("old", "a")]);
    const next = await recordScan("s2", [confirmed("new", "b")]);
    const unbranched = await recordScan("s3", [confirmed("other", "c")], { name: null, ref: "1".repeat(40) });
    const fake = fakeTypeSafe(0.9);

    await detect(next, null);
    await detect(unbranched, fake.gateway);
    await test.raw.update(tenants).set({ signalsEnabled: false }).where(eq(tenants.id, tenantId));
    await detect(next, fake.gateway);

    expect(fake.calls).toEqual([]);
    expect(await stored()).toEqual([]);
    expect(await skippedOf(next)).toBeNull();
  });

  it("goes on when TypeSafe fails, counts the failed pair as skipped and leaves the Scan succeeded", async () => {
    await recordScan("s1", [confirmed("old", "a")]);
    const next = await recordScan("s2", [confirmed("new", "b")]);
    const broken: TypeSafeGateway = { noul: async () => Promise.reject(new Error("TypeSafe answered 500")) };

    await detect(next, broken);

    const [row] = await test.raw.select({ status: scans.status }).from(scans).where(eq(scans.id, next));
    expect(row?.status).toBe("succeeded");
    expect(await skippedOf(next)).toBe(1);
  });
});
