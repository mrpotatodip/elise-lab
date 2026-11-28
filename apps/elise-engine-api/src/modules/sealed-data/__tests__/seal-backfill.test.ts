import { eq } from "drizzle-orm";
import { Effect } from "effect";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { sha256Hex } from "@repo/db-elise";
import {
  scanFindingComments,
  scanFindings,
  scanFindingTriage,
  scanFiles,
  scanRepoFindings,
  scanRunnerJobs,
  scans,
  scanUploadArchives,
  tenantCreditLedger,
  tenantDataKeys,
  tenantRunners,
} from "@repo/db-elise/schema";
import { fakeBindings, TEST_DATA_MASTER_KEY } from "#/__tests__/fake-bindings";
import { giveDataKey } from "#/__tests__/sealed-test-helpers";
import {
  asTenantEffect,
  branchIdOf,
  openTestDb,
  scanValues,
  seedRepo,
  seedTenant,
  type TestDb,
} from "#/__tests__/test-db";
import { callAs, tenantRouteApp } from "#/__tests__/tenant-route-harness";
import { sealBackfillEffect, sealerEffect } from "#/modules/sealed-data";

const SEALED = /^sealed:v1:/;
const FindingsSchema = z.object({
  data: z.object({
    findings: z.array(
      z.object({
        findingId: z.string(),
        title: z.string(),
        impact: z.string().nullable(),
        fingerprint: z.string(),
        triage: z.object({ note: z.string().nullable() }).nullable(),
      }),
    ),
  }),
});

let test: TestDb;
let acme: string;
let other: string;
let repoId: string;
const bindings = fakeBindings();
const app = tenantRouteApp(() => test);
const plain = (text: string) => {
  const encoded = new TextEncoder().encode(text);
  const bytes = new ArrayBuffer(encoded.length);
  new Uint8Array(bytes).set(encoded);
  return bytes;
};
const fileKey = (tenantId: string, name: string) => `accounts/${tenantId}/scans/s1/${name}`;

const backfill = (options: { dry?: boolean; maxBatches?: number } = {}) =>
  Effect.runPromise(
    sealBackfillEffect(
      {
        listAccounts: Effect.promise(async () => [acme, other]),
        inAccount: (accountId, make) => asTenantEffect(test, accountId, make),
        reports: bindings.env.REPORTS,
        masterKey: TEST_DATA_MASTER_KEY,
      },
      { batchSize: 2, dry: options.dry ?? false, maxBatches: options.maxBatches },
    ),
  );

const listAsMember = async () =>
  FindingsSchema.parse(await (await callAs(app, acme, "/findings")).json()).data.findings.toSorted((a, b) =>
    a.findingId.localeCompare(b.findingId),
  );

beforeAll(async () => {
  test = await openTestDb();
  acme = (await seedTenant(test, "acme")).tenantId;
  const second = await seedTenant(test, "other");
  other = second.tenantId;
  repoId = await seedRepo(test, acme);
  await seedRepo(test, other);
  const seal = await giveDataKey(test, acme);
  const branchId = await branchIdOf(test, repoId);
  await test.raw.insert(scans).values(scanValues(acme, repoId, "s1", "2026-11-01T00:00:00Z", { error: "boom" }));
  const common = { tenantId: acme, scanId: "s1", status: "confirmed", severity: "high", class: "authz" } as const;
  await test.raw.insert(scanFindings).values(
    await Promise.all(
      ["F-1", "F-2", "F-3", "F-4", "F-5"].map(async (id, index) => ({
        ...common,
        findingId: index === 4 ? await seal(id) : id,
        fingerprint: await sha256Hex(id),
        title: index === 4 ? await seal(`Title ${id}`) : `Title ${id}`,
        impact: `Impact ${id}`,
      })),
    ),
  );
  await test.raw.insert(scanRepoFindings).values({
    repoId,
    tenantId: acme,
    branchId,
    fingerprint: await sha256Hex("F-1"),
    state: "open",
    firstSeenScanId: "s1",
    lastSeenScanId: "s1",
  });
  await test.raw.insert(scanFindingTriage).values({
    tenantId: acme,
    repoId,
    fingerprint: await sha256Hex("F-1"),
    status: "false_positive",
    note: "plain note",
  });
  await test.raw.insert(scanFindingComments).values([
    { tenantId: acme, repoId, fingerprint: await sha256Hex("F-1"), body: "plain comment" },
    { tenantId: acme, repoId, fingerprint: await sha256Hex("F-2"), body: await seal("sealed comment") },
  ]);
  await test.raw
    .insert(tenantCreditLedger)
    .values({ tenantId: acme, kind: "topup", amountUsd: "10", idempotencyKey: "t1", note: "plain ledger note" });
  const [runner] = await test.raw
    .insert(tenantRunners)
    .values({ tenantId: acme, name: "r1", createdBy: second.partyId })
    .returning();
  await test.raw.insert(scanRunnerJobs).values({
    scanId: "s1",
    tenantId: acme,
    runnerId: runner.id,
    repoUrl: "https://github.com/octocat/Hello-World",
    prompt: "plain prompt",
    optionsJson: "{}",
    priorsJson: "",
  });
  const files = ["REPORT.md", "findings.json", "architecture.md"];
  for (const name of files) await bindings.env.REPORTS.put(fileKey(acme, name), plain(`plain ${name}`));
  await test.raw.insert(scanFiles).values(
    files.map((name) => ({
      tenantId: acme,
      scanId: "s1",
      name,
      r2Key: fileKey(acme, name),
      sizeBytes: 10,
      contentType: "text/plain",
    })),
  );
  await bindings.env.REPORTS.put(`accounts/${acme}/uploads/a1.zip`, plain("zip bytes"));
  await test.raw.insert(scanUploadArchives).values({
    tenantId: acme,
    repoId,
    label: "my zip",
    r2Key: `accounts/${acme}/uploads/a1.zip`,
    sizeBytes: 9,
    contentSha256: "a".repeat(64),
  });
});

afterAll(async () => {
  await test.close();
});

const plainTextLeft = async () => {
  const findings = await test.raw.select().from(scanFindings).where(eq(scanFindings.tenantId, acme));
  const triage = await test.raw.select().from(scanFindingTriage);
  const comments = await test.raw.select().from(scanFindingComments);
  const jobs = await test.raw.select().from(scanRunnerJobs);
  const ledger = await test.raw.select().from(tenantCreditLedger);
  const archives = await test.raw.select().from(scanUploadArchives);
  const [scan] = await test.raw.select().from(scans).where(eq(scans.id, "s1"));
  return [
    ...findings.flatMap((row) => [row.findingId, row.title, row.class, row.impact]),
    ...triage.map((row) => row.note),
    ...comments.map((row) => row.body),
    ...jobs.flatMap((row) => [row.prompt, row.optionsJson, row.priorsJson]),
    ...ledger.map((row) => row.note),
    ...archives.map((row) => row.label),
    scan.error,
  ].filter((value) => value !== null && !SEALED.test(value));
};

describe("sealBackfillEffect", () => {
  it("changes nothing on a dry run", async () => {
    const before = await plainTextLeft();

    const summary = await backfill({ dry: true });

    expect(summary.rows).toBeGreaterThan(0);
    expect(before.length).toBeGreaterThan(10);
    expect(await plainTextLeft()).toEqual(before);
  });

  it("finishes in two runs with a stop between, and shows the member the same Findings", async () => {
    const before = await listAsMember();

    const first = await backfill({ maxBatches: 2 });
    const second = await backfill();
    const third = await backfill();
    const after = await listAsMember();

    expect(first.stopped).toBe(true);
    expect(second.stopped).toBe(false);
    expect(second.rows).toBeGreaterThan(0);
    expect(third).toMatchObject({ rows: 0, objects: 0 });
    expect(await plainTextLeft()).toEqual([]);
    expect(after).toEqual(before);
  });

  it("does not seal again what is already sealed", async () => {
    const [row] = await test.raw.select().from(scanFindingTriage);

    await backfill();

    expect((await test.raw.select().from(scanFindingTriage))[0].note).toBe(row.note);
  });

  it("writes the HMAC fingerprint beside the old one and leaves the old one", async () => {
    const findings = await test.raw.select().from(scanFindings).where(eq(scanFindings.tenantId, acme));
    const sealer = await Effect.runPromise(sealerEffect(test.http, TEST_DATA_MASTER_KEY, acme));
    const [repoRow] = await test.raw.select().from(scanRepoFindings);
    const [triage] = await test.raw.select().from(scanFindingTriage);
    const hmacOfF1 = await sealer.fingerprint("F-1");

    expect(findings.map((row) => row.fingerprintHmac)).toContain(hmacOfF1);
    expect(findings.every((row) => row.fingerprint.length === 64 && row.fingerprintHmac !== null)).toBe(true);
    expect([repoRow.fingerprintHmac, triage.fingerprintHmac]).toEqual([hmacOfF1, hmacOfF1]);
    expect(repoRow.fingerprint).toBe(await sha256Hex("F-1"));
  });

  it("seals R2 objects and Archives so the Account can still open them", async () => {
    const sealer = await Effect.runPromise(sealerEffect(test.http, TEST_DATA_MASTER_KEY, acme));
    const report = await bindings.env.REPORTS.get(fileKey(acme, "REPORT.md"));
    const archive = await bindings.env.REPORTS.get(`accounts/${acme}/uploads/a1.zip`);

    expect(report?.customMetadata).toEqual({ sealed: "v1" });
    expect(archive?.customMetadata).toEqual({ sealed: "v1" });
    // SAFETY: the fake object has the body, metadata and arrayBuffer the unsealer reads.
    const opened = await sealer.open.object(report as never);
    // SAFETY: a sealed object opens to an ArrayBuffer, never a stream.
    expect(new TextDecoder().decode(opened as ArrayBuffer)).toBe("plain REPORT.md");
  });

  it("makes no Data key for an Account with nothing to seal", async () => {
    const keys = await test.raw.select().from(tenantDataKeys).where(eq(tenantDataKeys.tenantId, other));

    expect(keys).toEqual([]);
  });
});
