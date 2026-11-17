import { scanFiles, scanRepoBranches, scanRepos, scans, tenantAnthropicKeys, tenantCreditLedger, tenantRunners } from "@repo/db-elise/schema";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { openTestDb, scanValues, seedRepo, seedTenant, type TestDb } from "#/__tests__/test-db";

// -----
// Two Accounts hold rows in every table of the Scan data, the credit,
// the Runners and the stored key. Each reads as elise_app, the role
// without BYPASSRLS, in one transaction that sets app.tenant_id, the
// way the Worker does. Neither may see, change or add a row of the other.
// -----
type Seed = { tenantId: string; partyId: string; repoId: string };

const CatalogRows = z.array(z.object({ name: z.string(), enabled: z.boolean(), forced: z.boolean(), has_policy: z.boolean() }));

let test: TestDb;
let acme: Seed;
let other: Seed;

// -----
// Tables with a tenant_id column that keep no policy, and why. A new
// tenant table fails the catalog test until it has a policy or is
// listed here with a reason.
// - An invite is found by its token before the person belongs to any
//   Tenant, and its group list is found the same way.
// - party_master_roles and party_roles hold platform Roles with no
//   Tenant (a null tenant_id) that every Account must read, and a
//   Role check runs before any Tenant is set.
// - platform_invite_code_redemptions is written by sign-up, before
//   the Tenant it starts is known to the caller.
// - chat_bot_messages and chat_bot_thread_sessions belong to the chat
//   runtime, which has anonymous Customers and no Scan data. The
//   Worker does not use it yet (ADR 0001).
// -----
const NO_POLICY = [
  "tenant_team_invites",
  "tenant_team_invite_groups",
  "party_master_roles",
  "party_roles",
  "platform_invite_code_redemptions",
  "chat_bot_messages",
  "chat_bot_thread_sessions",
];

const seed = async (slug: string, repoSlug: string): Promise<Seed> => {
  const { tenantId, partyId } = await seedTenant(test, slug);
  const repoId = await seedRepo(test, tenantId, `https://github.com/octocat/${repoSlug}`);
  await test.raw.insert(scans).values(scanValues(tenantId, repoId, `scan-${slug}`, "2026-11-01T00:00:00Z"));
  await test.raw.insert(scanFiles).values({ tenantId, scanId: `scan-${slug}`, name: "REPORT.md", r2Key: `r2/${slug}/REPORT.md`, sizeBytes: 10, contentType: "text/markdown" });
  await test.raw.insert(tenantCreditLedger).values({ tenantId, kind: "topup", amountUsd: "10", idempotencyKey: `topup-${slug}` });
  await test.raw.insert(tenantRunners).values({ tenantId, name: `runner-${slug}`, createdBy: partyId });
  await test.raw.insert(tenantAnthropicKeys).values({ tenantId, sealedKey: `sealed-${slug}`, lastFour: "1234", updatedBy: partyId });
  return { tenantId, partyId, repoId };
};

beforeAll(async () => {
  test = await openTestDb();
  acme = await seed("acme", "alpha");
  other = await seed("other", "beta");
});

afterAll(async () => {
  await test.close();
});

type Tx = Parameters<Parameters<TestDb["raw"]["transaction"]>[0]>[0];
const asApp = <T>(tenant: string | null, run: (tx: Tx) => Promise<T>) =>
  test.raw.transaction(async (tx) => {
    await tx.execute(sql`set local role elise_app`);
    if (tenant) await tx.execute(sql`select set_config('app.tenant_id', ${tenant}, true)`);
    return run(tx);
  });

const readEverything = (tx: Tx) =>
  Promise.all([
    tx.select({ tenantId: scanRepos.tenantId }).from(scanRepos),
    tx.select({ tenantId: scanRepoBranches.tenantId }).from(scanRepoBranches),
    tx.select({ tenantId: scanFiles.tenantId }).from(scanFiles),
    tx.select({ tenantId: tenantCreditLedger.tenantId }).from(tenantCreditLedger),
    tx.select({ tenantId: tenantRunners.tenantId }).from(tenantRunners),
    tx.select({ tenantId: tenantAnthropicKeys.tenantId }).from(tenantAnthropicKeys),
  ]);

describe("two Accounts reading at the same time", () => {
  it("each sees only its own rows in every table, with no filter in the query", async () => {
    const [mine, theirs] = await Promise.all([asApp(acme.tenantId, readEverything), asApp(other.tenantId, readEverything)]);
    expect(mine.map((rows) => rows.map((row) => row.tenantId))).toEqual(mine.map(() => [acme.tenantId]));
    expect(theirs.map((rows) => rows.map((row) => row.tenantId))).toEqual(theirs.map(() => [other.tenantId]));
  });

  it("an Account that is not set sees nothing in any table", async () => {
    const found = await asApp(null, readEverything);
    expect(found.map((rows) => rows.length)).toEqual([0, 0, 0, 0, 0, 0]);
  });
});

describe("writing across Accounts", () => {
  it.each([
    ["a credit entry", (tx: Tx) => tx.insert(tenantCreditLedger).values({ tenantId: other.tenantId, kind: "topup", amountUsd: "999", idempotencyKey: "forged" })],
    ["a Scan file", (tx: Tx) => tx.insert(scanFiles).values({ tenantId: other.tenantId, scanId: "scan-other", name: "FORGED.md", r2Key: "r2/forged", sizeBytes: 1, contentType: "text/plain" })],
    ["a Runner", (tx: Tx) => tx.insert(tenantRunners).values({ tenantId: other.tenantId, name: "forged", createdBy: other.partyId })],
  ])("refuses %s for another Account", async (_name, forge) => {
    await expect(asApp(acme.tenantId, forge)).rejects.toMatchObject({ cause: { message: expect.stringContaining("row-level security") } });
  });

  it("cannot change or delete a row of another Account", async () => {
    await asApp(acme.tenantId, async (tx) => {
      await tx.update(tenantRunners).set({ name: "hijacked" });
      await tx.delete(tenantAnthropicKeys);
      await tx.delete(tenantCreditLedger);
    });
    const [runner] = await test.raw.select({ name: tenantRunners.name }).from(tenantRunners).where(sql`${tenantRunners.tenantId} = ${other.tenantId}`);
    const keys = await test.raw.select().from(tenantAnthropicKeys).where(sql`${tenantAnthropicKeys.tenantId} = ${other.tenantId}`);
    const ledger = await test.raw.select().from(tenantCreditLedger).where(sql`${tenantCreditLedger.tenantId} = ${other.tenantId}`);
    expect({ runner: runner.name, keys: keys.length, ledger: ledger.length }).toEqual({ runner: "runner-other", keys: 1, ledger: 1 });
  });
});

describe("the catalog", () => {
  it("every table with a tenant_id column forces a policy on it, or is listed with a reason", async () => {
    const result = await test.raw.execute(sql`
      select c.relname as name, c.relrowsecurity as enabled, c.relforcerowsecurity as forced,
             exists (select 1 from pg_policy p where p.polrelid = c.oid) as has_policy
      from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
      join pg_attribute a on a.attrelid = c.oid and a.attname = 'tenant_id' and not a.attisdropped
      where n.nspname = 'public' and c.relkind = 'r'
      order by c.relname`);
    const rows = CatalogRows.parse(result.rows);
    const unprotected = rows
      .filter((row) => !(row.enabled && row.forced && row.has_policy))
      .map((row) => row.name)
      .filter((name) => !NO_POLICY.includes(name));
    expect(unprotected).toEqual([]);
  });
});
