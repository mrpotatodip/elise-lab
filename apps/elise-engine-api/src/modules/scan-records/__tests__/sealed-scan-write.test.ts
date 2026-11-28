import { eq } from "drizzle-orm";
import { Effect } from "effect";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { sha256Hex } from "@repo/db-elise";
import { scanFindings, scanFindingTriage, scanSignals, scans, tenants } from "@repo/db-elise/schema";
import { fakeBindings, TEST_DATA_MASTER_KEY } from "#/__tests__/fake-bindings";
import { fakeTypeSafe } from "#/__tests__/fake-typesafe";
import { openTestDb, scanValues, seedRepo, seedTenant, type TestDb } from "#/__tests__/test-db";
import { callAs, tenantRouteApp } from "#/__tests__/tenant-route-harness";
import { resolveScanBranchEffect } from "#/modules/branches";
import { handoverFilesSvc } from "#/modules/decided-problems";
import { saveScanFilesEffect } from "#/modules/scan-store";
import { recordSealedScanSvc } from "#/modules/scan-records/handlers";
import { sealerEffect } from "#/modules/sealed-data";
import { detectDuplicateSignalsSvc } from "#/modules/signals";
import type { ScanParams } from "#/schemas";

const REPO = "https://github.com/octocat/Hello-World";
const COMMIT = "c".repeat(40);
const SEALED = /^sealed:v1:/;
const run = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(effect);

const FindingsSchema = z.object({
  data: z.object({
    findings: z.array(
      z.object({
        findingId: z.string(),
        title: z.string(),
        impact: z.string().nullable(),
        fingerprint: z.string(),
        triage: z.object({ status: z.string(), note: z.string().nullable() }).nullable(),
      }),
    ),
  }),
});
const VerdictSchema = z.object({
  data: z.object({
    open: z.array(z.object({ title: z.string() })),
    dismissed: z.array(z.object({ title: z.string() })),
  }),
});
const ScanSchema = z.object({ data: z.object({ error: z.string().nullable() }) });

let test: TestDb;
let acme: string;
let other: string;
let repoId: string;
let otherRepoId: string;
let tick = 0;
const bindings = fakeBindings();
const app = tenantRouteApp(() => test);

const confirmed = (id: string, title: string) => ({
  verdict: "confirmed",
  fingerprint: id,
  title,
  class: "injection",
  description: `${title}: reads another tenant's data`,
  severity: { overall_severity: "high" },
  evidence: [{ file: "src/orders.ts", line: 1, description: "the query has no tenant filter" }],
  remediation: { strategy: "add the tenant filter" },
});

const recordScan = async (
  scanId: string,
  findings: unknown[],
  over: { tenant?: string; repo?: string; status?: "succeeded" | "failed"; error?: string } = {},
) => {
  tick += 1;
  const tenant = over.tenant ?? acme;
  const repo = over.repo ?? repoId;
  const status = over.status ?? "succeeded";
  const createdAt = new Date(Date.UTC(2026, 10, 1, 0, tick)).toISOString();
  await test.raw
    .insert(scans)
    .values(scanValues(tenant, repo, scanId, createdAt, { skill: "full", status: "running", commitSha: COMMIT }));
  const params: ScanParams = {
    scanId,
    accountId: tenant,
    repo: REPO,
    options: { skill: "full", model: "claude-haiku-5-5", effort: "low", profile: "quick", maxBudgetUsd: 1 },
    createdAt,
  };
  const sealer = await run(sealerEffect(test.http, TEST_DATA_MASTER_KEY, tenant));
  await run(
    saveScanFilesEffect(bindings.env.REPORTS, sealer, tenant, scanId, {
      "REPORT.md": "# Report of src/orders.ts",
      "findings.json": JSON.stringify(findings),
    }),
  );
  const outcome = await run(resolveScanBranchEffect(test.http, tenant, repo, { name: "main", ref: null }));
  await run(
    recordSealedScanSvc(
      test.http,
      { REPORTS: bindings.env.REPORTS, DATA_MASTER_KEY: TEST_DATA_MASTER_KEY },
      params,
      repo,
      { ...outcome, name: "main" },
      status,
      over.error ?? null,
      null,
    ),
  );
  return scanId;
};

const rawFindings = (scanId: string) => test.raw.select().from(scanFindings).where(eq(scanFindings.scanId, scanId));
const listAs = async (accountId: string, query = "") =>
  FindingsSchema.parse(await (await callAs(app, accountId, `/findings${query}`)).json()).data.findings;
const hmacOf = async (id: string) => (await run(sealerEffect(test.http, TEST_DATA_MASTER_KEY, acme))).fingerprint(id);

beforeAll(async () => {
  test = await openTestDb();
  acme = (await seedTenant(test, "acme")).tenantId;
  other = (await seedTenant(test, "other")).tenantId;
  repoId = await seedRepo(test, acme, REPO);
  otherRepoId = await seedRepo(test, other, REPO);
});

afterAll(async () => {
  await test.close();
});

describe("a Scan's record on a second Account's Data key", () => {
  it("stores the Finding's free text and id sealed, not as plain text, and a file in the bucket as sealed bytes", async () => {
    await recordScan("s1", [confirmed("SQLI-1", "Missing tenant filter")]);
    const [row] = await rawFindings("s1");
    const stored = bindings.store.get(`accounts/${acme}/scans/s1/findings.json`);

    expect([row.findingId, row.title, row.class, row.file, row.impact, row.evidence, row.fix]).toEqual(
      Array.from({ length: 7 }, () => expect.stringMatching(SEALED)),
    );
    expect(stored).toBeInstanceOf(ArrayBuffer);
  });

  it("shows a member the Finding as it was reported", async () => {
    const [finding] = await listAs(acme);

    expect([finding.findingId, finding.title, finding.impact]).toEqual([
      "SQLI-1",
      "Missing tenant filter",
      "Missing tenant filter: reads another tenant's data",
    ]);
  });

  it("shows 'cannot be read' when the sealed values are copied into another Account's row", async () => {
    const [mine] = await rawFindings("s1");
    await test.raw
      .insert(scans)
      .values(scanValues(other, otherRepoId, "theirs", "2026-11-01T00:00:00Z", { skill: "full" }));
    await test.raw.insert(scanFindings).values({ ...mine, id: undefined, tenantId: other, scanId: "theirs" });

    const [copied] = await listAs(other);

    expect([copied.findingId, copied.title, copied.impact]).toEqual([
      "cannot be read",
      "cannot be read",
      "cannot be read",
    ]);
  });

  it("keeps a failed Scan's error sealed and shows it opened", async () => {
    await recordScan("failed-1", [], { status: "failed", error: "the agent read a secret in src/payments.ts" });
    const [row] = await test.raw.select({ error: scans.error }).from(scans).where(eq(scans.id, "failed-1"));
    const res = await callAs(app, acme, "/scans/failed-1");

    expect(row.error).toMatch(SEALED);
    expect(ScanSchema.parse(await res.json()).data.error).toBe("the agent read a secret in src/payments.ts");
  });
});

describe("a second Scan of the same Branch", () => {
  it("gives the same id in the same Account the same fingerprint, the Account's HMAC and not a plain hash", async () => {
    await recordScan("s2", [confirmed("SQLI-1", "Missing tenant filter, renamed")]);
    const [first] = await rawFindings("s1");
    const [second] = await rawFindings("s2");

    expect([first.fingerprint, second.fingerprint]).toEqual([await hmacOf("SQLI-1"), await hmacOf("SQLI-1")]);
    expect(first.fingerprint).not.toBe(await sha256Hex("SQLI-1"));
  });

  it("gives another Account a different fingerprint for the same id", async () => {
    await recordScan("theirs-2", [confirmed("SQLI-1", "Missing tenant filter")], { tenant: other, repo: otherRepoId });
    const [theirs] = await rawFindings("theirs-2");

    expect(theirs.fingerprint).not.toBe(await hmacOf("SQLI-1"));
  });

  it("keeps a decision, its sealed note, the decided problems and the Verdict on that Finding", async () => {
    const fingerprint = await hmacOf("SQLI-1");
    const decided = await callAs(app, acme, "/findings/triage", {
      method: "PUT",
      body: { repo: REPO, fingerprint, status: "false_positive", note: "a fixture, not real" },
    });
    const [{ note }] = await test.raw
      .select({ note: scanFindingTriage.note })
      .from(scanFindingTriage)
      .where(eq(scanFindingTriage.fingerprint, fingerprint));
    await recordScan("s3", [confirmed("SQLI-1", "Missing tenant filter")]);
    const [now] = await listAs(acme, "?triage=false_positive");
    const files = await run(handoverFilesSvc(test.http, acme, REPO, undefined, TEST_DATA_MASTER_KEY));
    const verdict = VerdictSchema.parse(
      await (await callAs(app, acme, `/repos/${repoId}/verdict?commit=${COMMIT}`)).json(),
    ).data;

    expect(decided.status).toBe(200);
    expect(note).toMatch(SEALED);
    expect([now.title, now.triage?.note]).toEqual(["Missing tenant filter", "a fixture, not real"]);
    expect(files.map((file) => file.content).join("\n")).toContain("Missing tenant filter");
    expect([verdict.open, verdict.dismissed.map((item) => item.title)]).toEqual([[], ["Missing tenant filter"]]);
  });

  it("asks the Signal question about a new Finding and an open one, and stores it against their fingerprints", async () => {
    await recordScan("s4", [
      confirmed("SQLI-2", "Orders query lacks tenant scope"),
      confirmed("SQLI-9", "Another one"),
    ]);
    const fake = fakeTypeSafe(0.9);
    await test.raw.update(tenants).set({ signalsEnabled: true }).where(eq(tenants.id, acme));

    await run(detectDuplicateSignalsSvc(test.http, fake.gateway, acme, "s4", TEST_DATA_MASTER_KEY));
    const stored = await test.raw
      .select({ fingerprint: scanSignals.fingerprint, related: scanSignals.relatedFingerprint })
      .from(scanSignals)
      .where(eq(scanSignals.tenantId, acme));

    expect(fake.calls.length).toBeGreaterThan(0);
    expect(stored.length).toBeGreaterThan(0);
    expect(stored.every((signal) => /^[0-9a-f]{64}$/.test(signal.fingerprint))).toBe(true);
  });
});

describe("a Repo that already holds a Finding by its old fingerprint", () => {
  it("keeps that fingerprint on the new Scan's row, so the decision and the History still meet it", async () => {
    const oldFingerprint = await sha256Hex("LEGACY-1");
    await test.raw
      .insert(scans)
      .values(scanValues(acme, repoId, "legacy-old", "2026-10-01T00:00:00Z", { skill: "full" }));
    await test.raw.insert(scanFindings).values({
      tenantId: acme,
      scanId: "legacy-old",
      findingId: "LEGACY-1",
      fingerprint: oldFingerprint,
      status: "confirmed",
      severity: "high",
      title: "An old plain Finding",
      class: "injection",
    });
    await test.raw
      .insert(scanFindingTriage)
      .values({ tenantId: acme, repoId, fingerprint: oldFingerprint, status: "false_positive", note: "old decision" });

    await recordScan("legacy-new", [confirmed("LEGACY-1", "An old Finding, found again")]);
    const [row] = await rawFindings("legacy-new");
    const shown = (await listAs(acme)).find(
      (finding) => finding.findingId === "LEGACY-1" && finding.title.includes("again"),
    );

    expect([row.fingerprint, shown?.triage?.status]).toEqual([oldFingerprint, "false_positive"]);
  });

  it("writes the HMAC for a Finding the Repo has never held", async () => {
    await recordScan("legacy-fresh", [confirmed("FRESH-1", "Never seen")]);
    const [row] = await rawFindings("legacy-fresh");

    expect(row.fingerprint).toBe(await hmacOf("FRESH-1"));
  });
});
