import { Effect } from "effect";
import { eq } from "drizzle-orm";
import { authUser, platformMasterPlans, scans, tenantCreditLedger, tenantSubscriptions } from "@repo/db-elise";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { ScanUsage } from "@repo/contracts/elise";
import { callAs, tenantRouteApp } from "#/__tests__/tenant-route-harness";
import { openTestDb, scanValues, seedRepo, seedTenant, type TestDb } from "#/__tests__/test-db";
import type { ScanOptions, ScanParams } from "#/schemas";
import { runnerSandbox } from "#/modules/runners/lib";
import { claimPairingEffect, createRunnerEffect } from "#/modules/runners/queries";
import { balanceEffect, holdCreditEffect, settleCreditEffect } from "#/modules/credit";

let test: TestDb;
let tenantId: string;
let runnerId: string;
let counter = 0;
const torn: string[] = [];
let metered: ScanUsage | null = null;
let failTeardown = false;

const USAGE: ScanUsage = { inputTokens: 1000, outputTokens: 500, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0.5, turns: 3, durationMs: 4000 };
const HOLD_USD = 3;
const NOW = new Date("2026-11-19T09:00:00Z");
const OPTIONS: ScanOptions = { skill: "full", model: "claude-sonnet-5-5", effort: "high", profile: "quick", maxBudgetUsd: 2 };

const app = tenantRouteApp(() => test, {
  teardownScan: async (_env, scanId) => {
    torn.push(scanId);
    if (failTeardown) throw new Error("the sandbox did not answer");
    return metered;
  },
});

const run = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(effect);

const newScan = async (status: "queued" | "running", options: { held?: boolean; runnerJob?: boolean } = {}) => {
  counter += 1;
  const scanId = `stop-cloud-${counter}`;
  const repoId = await seedRepo(test, tenantId, `https://github.com/octocat/cloud-${counter}`);
  await test.raw.insert(scans).values(scanValues(tenantId, repoId, scanId, "2026-11-19T09:00:00Z", { status, skill: "full", maxBudgetUsd: "2.00" }));
  if (options.held !== false) await run(holdCreditEffect(test.pool, { tenantId, scanId, holdUsd: HOLD_USD }));
  if (options.runnerJob === true) {
    const params: ScanParams = { scanId, accountId: tenantId, repo: "https://github.com/octocat/Hello-World", options: OPTIONS, keySource: "account", runnerId, createdAt: NOW.toISOString() };
    await runnerSandbox(test.http, params, runnerId, () => NOW).launchAgent(OPTIONS);
  }
  return scanId;
};

const stop = (scanId: string) => callAs(app, tenantId, `/scans/${scanId}/stop`, { method: "POST" });
const settleRows = (scanId: string) => test.raw.select().from(tenantCreditLedger).where(eq(tenantCreditLedger.scanId, scanId));
const settledOf = async (scanId: string) => (await settleRows(scanId)).find((row) => row.kind === "scan_settle");

beforeAll(async () => {
  test = await openTestDb();
  const seeded = await seedTenant(test, "stop-cloud-account");
  tenantId = seeded.tenantId;
  const userId = crypto.randomUUID();
  await test.raw.insert(authUser).values({ id: userId, name: "Ada", email: "stop-cloud@example.com", emailVerified: true, partyId: seeded.partyId });
  runnerId = (await run(createRunnerEffect(test.http, { tenantId, actorUserId: userId, name: "stopper", codeHash: "cloud-code", expiresAt: new Date("2026-11-19T10:00:00Z") }))).id;
  await run(claimPairingEffect(test.http, { codeHash: "cloud-code", tokenHash: "cloud-token", now: NOW }));
  const [pro] = await test.raw.select().from(platformMasterPlans).where(eq(platformMasterPlans.key, "pro"));
  await test.raw.insert(tenantSubscriptions).values({ tenantId, planId: pro.id, status: "active", source: "grant" });
  await test.raw.insert(tenantCreditLedger).values({ tenantId, kind: "topup", amountUsd: "100.0000", idempotencyKey: "stop-cloud-topup" });
});

afterAll(async () => {
  await test.close();
});

describe("stopping a cloud Scan", () => {
  it("destroys the sandbox, records the cost metered up to the stop and charges it at the plan's markup", async () => {
    metered = USAGE;
    const scanId = await newScan("running");
    const res = await stop(scanId);
    const [row] = await test.raw.select().from(scans).where(eq(scans.id, scanId));

    expect(res.status).toBe(200);
    expect(torn).toContain(scanId);
    expect(row).toMatchObject({ status: "stopped", costUsd: "0.5000", inputTokens: 1000, outputTokens: 500 });
    expect(Number((await settledOf(scanId))?.amountUsd)).toBe(2.25);
  });

  it("ends a queued Scan whose sandbox never started with no charge and gives the whole hold back", async () => {
    metered = null;
    const before = await run(balanceEffect(test.http, tenantId));
    const scanId = await newScan("queued");
    const res = await stop(scanId);
    const [row] = await test.raw.select().from(scans).where(eq(scans.id, scanId));

    expect(res.status).toBe(200);
    expect(row.status).toBe("stopped");
    expect(row.costUsd).toBeNull();
    expect(Number((await settledOf(scanId))?.amountUsd)).toBe(HOLD_USD);
    expect(await run(balanceEffect(test.http, tenantId))).toBe(before);
  });

  it("is not settled a second time by a Workflow that reaches its end after the stop", async () => {
    metered = USAGE;
    const scanId = await newScan("running");
    await stop(scanId);
    const late = await run(settleCreditEffect(test.pool, { tenantId, scanId, chargeUsd: HOLD_USD }));

    expect(late.settled).toBe(false);
    expect((await settleRows(scanId)).filter((row) => row.kind === "scan_settle")).toHaveLength(1);
  });

  it("gives the hold back when the sandbox could not be torn down, so a second Stop has nothing left to settle", async () => {
    failTeardown = true;
    const before = await run(balanceEffect(test.http, tenantId));
    const scanId = await newScan("running");
    const res = await stop(scanId);
    failTeardown = false;

    expect(res.status).toBe(200);
    expect(Number((await settledOf(scanId))?.amountUsd)).toBe(HOLD_USD);
    expect(await run(balanceEffect(test.http, tenantId))).toBe(before);
  });

  it("leaves a Scan on a Runner alone: no sandbox to destroy", async () => {
    const scanId = await newScan("running", { held: false, runnerJob: true });
    torn.length = 0;
    const res = await stop(scanId);

    expect(res.status).toBe(200);
    expect(torn).toEqual([]);
  });
});
