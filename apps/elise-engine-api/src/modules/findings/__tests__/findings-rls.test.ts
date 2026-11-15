import { scanFindingComments, scanFindings, scanFindingTriage, scans } from "@repo/db-elise/schema";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { openTestDb, scanValues, seedRepo, seedTenant, type TestDb } from "#/__tests__/test-db";

let test: TestDb;
let tenantId: string;
let otherTenantId: string;
let repoId: string;
let otherRepoId: string;

const fp = (letter: string) => letter.repeat(64);

beforeAll(async () => {
  test = await openTestDb();
  tenantId = (await seedTenant(test, "acme")).tenantId;
  otherTenantId = (await seedTenant(test, "other")).tenantId;
  repoId = await seedRepo(test, tenantId);
  otherRepoId = await seedRepo(test, otherTenantId);
  await test.raw.insert(scans).values([scanValues(tenantId, repoId, "mine", "2026-11-01T00:00:00Z"), scanValues(otherTenantId, otherRepoId, "theirs", "2026-11-01T00:00:00Z")]);
  await test.raw.insert(scanFindings).values([
    { tenantId, scanId: "mine", findingId: "F-1", fingerprint: fp("a"), status: "confirmed", severity: "high", title: "mine", class: "authz" },
    { tenantId: otherTenantId, scanId: "theirs", findingId: "F-2", fingerprint: fp("b"), status: "confirmed", severity: "high", title: "theirs", class: "authz" },
  ]);
  await test.raw.insert(scanFindingComments).values([
    { tenantId, repoId, fingerprint: fp("a"), body: "mine" },
    { tenantId: otherTenantId, repoId: otherRepoId, fingerprint: fp("b"), body: "theirs" },
  ]);
});

afterAll(async () => {
  await test.close();
});

// -----
// Runs as elise_app, the role that has no BYPASSRLS, inside one
// transaction, the way the Worker will. A null tenant sets nothing.
// -----
const asApp = <T>(tenant: string | null, run: (tx: Parameters<Parameters<TestDb["raw"]["transaction"]>[0]>[0]) => Promise<T>) =>
  test.raw.transaction(async (tx) => {
    await tx.execute(sql`set local role elise_app`);
    if (tenant) await tx.execute(sql`select set_config('app.tenant_id', ${tenant}, true)`);
    return run(tx);
  });

describe("row-level security on scans and findings", () => {
  it("shows an account its own scans, findings and comments, and no other", async () => {
    const found = await asApp(tenantId, async (tx) => ({
      scans: await tx.select({ id: scans.id }).from(scans),
      findings: await tx.select({ id: scanFindings.findingId }).from(scanFindings),
      comments: await tx.select({ body: scanFindingComments.body }).from(scanFindingComments),
    }));
    expect(found).toEqual({ scans: [{ id: "mine" }], findings: [{ id: "F-1" }], comments: [{ body: "mine" }] });
  });

  it("shows nothing when no account is set, even to a query with no filter", async () => {
    const found = await asApp(null, async (tx) => ({
      scans: await tx.select().from(scans),
      findings: await tx.select().from(scanFindings),
      triage: await tx.select().from(scanFindingTriage),
      comments: await tx.select().from(scanFindingComments),
    }));
    expect(found).toEqual({ scans: [], findings: [], triage: [], comments: [] });
  });

  it("refuses to write a comment for another account", async () => {
    const write = asApp(tenantId, (tx) => tx.insert(scanFindingComments).values({ tenantId: otherTenantId, repoId: otherRepoId, fingerprint: fp("b"), body: "forged" }));
    await expect(write).rejects.toMatchObject({ cause: { message: expect.stringContaining("row-level security") } });
  });

  it("refuses to write a row for another account", async () => {
    const write = asApp(tenantId, (tx) =>
      tx.insert(scanFindings).values({ tenantId: otherTenantId, scanId: "theirs", findingId: "F-3", fingerprint: fp("c"), status: "confirmed", severity: "low", title: "x", class: "authz" }),
    );
    await expect(write).rejects.toMatchObject({ cause: { message: expect.stringContaining("row-level security") } });
  });
});
