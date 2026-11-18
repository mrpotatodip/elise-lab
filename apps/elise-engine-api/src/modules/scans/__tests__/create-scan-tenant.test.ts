import { and, eq } from "drizzle-orm";
import { platformMasterPlans, scanRepos, scans,tenantAnthropicKeys, tenantCreditLedger, tenants, tenantSubscriptions } from "@repo/db-elise/schema";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { fakeBindings, TEST_TOKEN, testExecutionContext } from "#/__tests__/fake-bindings";
import { openTestDb, seedTenant, type TestDb } from "#/__tests__/test-db";
import { tenantRouteApp, type TenantRouteApp } from "#/__tests__/tenant-route-harness";
import { realAppDeps } from "#/lib/app-deps";

const REPO = "https://github.com/octocat/Hello-World";
const ErrorBodySchema = z.object({ error: z.object({ code: z.string() }) });

let test: TestDb;
const app = tenantRouteApp(() => test);

// -----
// One Account per case: "pro" has a platform Plan and credit,
// "broke" the Plan and no credit, "capped" credit and a $1
// Monthly budget, "own" no Plan and a key of its own, "raced" the
// same as "pro" but another Scan takes its credit before the hold.
// -----
const accountOf = new Map<string, string>();

beforeAll(async () => {
  test = await openTestDb();
  const [pro] = await test.raw.select().from(platformMasterPlans).where(eq(platformMasterPlans.key, "pro"));
  for (const name of ["pro", "broke", "capped", "own", "raced"]) {
    const { tenantId, partyId } = await seedTenant(test, name);
    accountOf.set(name, tenantId);
    if (name === "own") await test.raw.insert(tenantAnthropicKeys).values({ tenantId, sealedKey: "sealed", lastFour: "mine", updatedBy: partyId });
    else await test.raw.insert(tenantSubscriptions).values({ tenantId, planId: pro.id, status: "active", source: "grant" });
    if (name === "pro" || name === "capped" || name === "raced") await test.raw.insert(tenantCreditLedger).values({ tenantId, kind: "topup", amountUsd: "100.0000", idempotencyKey: `${name}-topup` });
    if (name === "capped") await test.raw.update(tenants).set({ monthlyScanBudgetUsd: "1.00" }).where(eq(tenants.id, tenantId));
  }
});

afterAll(async () => {
  await test.close();
});

const holdLostToAnotherScanApp = tenantRouteApp(() => test, {
  holdCredit: (db, accountId, scanId) => realAppDeps.holdCredit(db, accountId, scanId, 1000),
});

const postAs = async (name: string, on: TenantRouteApp = app) => {
  const { env, createdFull } = fakeBindings();
  const accountId = accountOf.get(name) ?? "";
  const headers = { authorization: `Bearer ${TEST_TOKEN}`, "x-account-id": accountId, "content-type": "application/json" };
  const res = await on.fetch(new Request("http://localhost/scans", { method: "POST", headers, body: JSON.stringify({ repo: REPO }) }), env, testExecutionContext);
  const rows = await test.raw.select({ id: scans.id }).from(scans).where(eq(scans.tenantId, accountId));
  const holds = await test.raw
    .select({ amountUsd: tenantCreditLedger.amountUsd })
    .from(tenantCreditLedger)
    .where(and(eq(tenantCreditLedger.tenantId, accountId), eq(tenantCreditLedger.kind, "scan_hold")));
  return { res, rows, holds, started: createdFull.length };
};

describe("POST /scans as one Account", () => {
  it("writes the Scan row and its credit hold, then starts the Workflow", async () => {
    const { res, rows, holds, started } = await postAs("pro");

    expect({ status: res.status, rows: rows.length, holds: holds.map((hold) => hold.amountUsd), started }).toEqual({ status: 201, rows: 1, holds: ["-9.0000"], started: 1 });
  });

  it.each([
    ["credit", "broke", "INSUFFICIENT_CREDIT"],
    ["the Monthly budget", "capped", "MONTHLY_BUDGET_EXCEEDED"],
  ])("leaves no row and no hold for a Scan refused for %s", async (_name, account, code) => {
    const { res, rows, holds, started } = await postAs(account);

    expect({ status: res.status, code: ErrorBodySchema.parse(await res.json()).error.code, rows: rows.length, holds: holds.length, started }).toEqual({ status: 429, code, rows: 0, holds: 0, started: 0 });
  });

  it("leaves no row and no hold when the hold is refused under the lock after the row is written", async () => {
    const { res, rows, holds, started } = await postAs("raced", holdLostToAnotherScanApp);

    expect({ status: res.status, code: ErrorBodySchema.parse(await res.json()).error.code, rows: rows.length, holds: holds.length, started }).toEqual({
      status: 429,
      code: "INSUFFICIENT_CREDIT",
      rows: 0,
      holds: 0,
      started: 0,
    });
  });

  it("takes no hold for a Scan on the Account's own key", async () => {
    const { res, rows, holds, started } = await postAs("own");

    expect({ status: res.status, rows: rows.length, holds: holds.length, started }).toEqual({ status: 201, rows: 1, holds: 0, started: 1 });
  });

  it("files a request without a provider under the github Repo on github.com", async () => {
    await postAs("pro");

    const stored = await test.raw
      .select({ provider: scanRepos.provider, host: scanRepos.host, canonical: scanRepos.canonical })
      .from(scanRepos)
      .where(eq(scanRepos.tenantId, accountOf.get("pro") ?? ""));

    expect(stored).toEqual([{ provider: "github", host: "github.com", canonical: "octocat/hello-world" }]);
  });

  it("refuses a provider the engine has no parser for, and writes nothing", async () => {
    const { env } = fakeBindings();
    const accountId = accountOf.get("own") ?? "";
    const headers = { authorization: `Bearer ${TEST_TOKEN}`, "x-account-id": accountId, "content-type": "application/json" };
    const before = await test.raw.select({ id: scans.id }).from(scans).where(eq(scans.tenantId, accountId));

    const res = await app.fetch(new Request("http://localhost/scans", { method: "POST", headers, body: JSON.stringify({ repo: REPO, provider: "bitbucket" }) }), env, testExecutionContext);
    const after = await test.raw.select({ id: scans.id }).from(scans).where(eq(scans.tenantId, accountId));

    expect({ status: res.status, written: after.length - before.length }).toEqual({ status: 400, written: 0 });
  });
});
