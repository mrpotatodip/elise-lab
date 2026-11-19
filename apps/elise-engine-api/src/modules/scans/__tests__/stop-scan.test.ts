import { Effect } from "effect";
import { eq } from "drizzle-orm";
import { authUser, scanRunnerJobs, scans } from "@repo/db-elise";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { callAs, tenantRouteApp } from "#/__tests__/tenant-route-harness";
import { openTestDb, scanValues, seedRepo, seedTenant, type TestDb } from "#/__tests__/test-db";
import type { ScanOptions, ScanParams } from "#/schemas";
import { claimJobSvc, reportJobSvc } from "#/modules/runners/handlers";
import { runnerSandbox } from "#/modules/runners/lib";
import { claimPairingEffect, createRunnerEffect, readRunnerJobEffect } from "#/modules/runners/queries";
import { activeScansEffect, neonScanRepo } from "#/modules/scan-ledger";

let test: TestDb;
let tenantId: string;
let otherTenantId: string;
let runnerId: string;
let counter = 0;

const app = tenantRouteApp(() => test);
const NOW = new Date("2026-11-19T09:00:00Z");
const OPTIONS: ScanOptions = { skill: "full", model: "claude-sonnet-5-5", effort: "high", profile: "quick", maxBudgetUsd: 2 };
const StoppedBodySchema = z.object({ data: z.object({ scanId: z.string(), status: z.string() }).nullable(), error: z.unknown() });

const run = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(effect);

const newScan = async (status: "queued" | "running" | "succeeded", withJob = true) => {
  counter += 1;
  const scanId = `stop-scan-${counter}`;
  const ownRepoId = await seedRepo(test, tenantId, `https://github.com/octocat/repo-${counter}`);
  await test.raw.insert(scans).values(scanValues(tenantId, ownRepoId, scanId, NOW.toISOString(), { status, skill: "full", updatedAt: new Date() }));
  if (withJob) {
    const params: ScanParams = { scanId, accountId: tenantId, repo: "https://github.com/octocat/Hello-World", options: OPTIONS, keySource: "account", runnerId, createdAt: NOW.toISOString() };
    await runnerSandbox(test.http, params, runnerId, () => NOW).launchAgent(OPTIONS);
  }
  return scanId;
};

const stop = (scanId: string, as = tenantId) => callAs(app, as, `/scans/${scanId}/stop`, { method: "POST" });
const jobState = async (scanId: string) => (await run(readRunnerJobEffect(test.http, scanId)))?.state;
const statusOf = async (scanId: string) => (await test.raw.select().from(scans).where(eq(scans.id, scanId)))[0].status;

beforeAll(async () => {
  test = await openTestDb();
  const seeded = await seedTenant(test, "stop-account");
  tenantId = seeded.tenantId;
  otherTenantId = (await seedTenant(test, "stop-other")).tenantId;
  const userId = crypto.randomUUID();
  await test.raw.insert(authUser).values({ id: userId, name: "Ada", email: "stop@example.com", emailVerified: true, partyId: seeded.partyId });
  const created = await run(createRunnerEffect(test.http, { tenantId, actorUserId: userId, name: "stopper", codeHash: "stop-code", expiresAt: new Date("2026-11-19T10:00:00Z") }));
  await run(claimPairingEffect(test.http, { codeHash: "stop-code", tokenHash: "stop-token", now: NOW }));
  runnerId = created.id;
});

afterAll(async () => {
  await test.close();
});

describe("stopping a Scan", () => {
  it("ends a queued Scan at once, cancels its job so no Runner claims it, and frees the active slot", async () => {
    const scanId = await newScan("queued");
    const res = await stop(scanId);

    expect(res.status).toBe(200);
    expect(StoppedBodySchema.parse(await res.json()).data).toMatchObject({ scanId, status: "stopped" });
    expect(await jobState(scanId)).toBe("cancelled");
    expect(await run(claimJobSvc(test.http, runnerId))).toBeNull();
    expect((await run(activeScansEffect(test.http, tenantId, Date.now()))).map((scan) => scan.scanId)).not.toContain(scanId);
  });

  it("ends a running Scan and refuses the report its Runner sends late", async () => {
    const scanId = await newScan("running");
    await test.raw.update(scanRunnerJobs).set({ state: "claimed" }).where(eq(scanRunnerJobs.scanId, scanId));
    await stop(scanId);
    const late = await Effect.runPromiseExit(reportJobSvc(test.http, runnerId, scanId, { state: "succeeded", files: { "REPORT.md": "# late" } }));

    expect(await statusOf(scanId)).toBe("stopped");
    expect(await jobState(scanId)).toBe("cancelled");
    expect(late._tag).toBe("Failure");
  });

  it("answers a conflict for a Scan that already ended and changes nothing", async () => {
    const scanId = await newScan("succeeded", false);
    const res = await stop(scanId);

    expect(res.status).toBe(409);
    expect(await statusOf(scanId)).toBe("succeeded");
  });

  it("does not find a Scan of another Account", async () => {
    const scanId = await newScan("running");
    const res = await stop(scanId, otherTenantId);

    expect(res.status).toBe(404);
    expect(await statusOf(scanId)).toBe("running");
  });

  it("is never turned into failed or running again by the Workflow that is still running", async () => {
    const scanId = await newScan("running");
    await stop(scanId);
    await run(neonScanRepo(test.http).mark(tenantId, scanId, { status: "failed", error: "the scan ended before the runner reported" }));
    await run(neonScanRepo(test.http).mark(tenantId, scanId, { status: "running", step: "auditing" }));

    expect(await statusOf(scanId)).toBe("stopped");
  });

  it("queues no job for a Scan stopped before the Workflow got to it", async () => {
    const scanId = await newScan("queued", false);
    await stop(scanId);
    const params: ScanParams = { scanId, accountId: tenantId, repo: "https://github.com/octocat/Hello-World", options: OPTIONS, keySource: "account", runnerId, createdAt: NOW.toISOString() };
    await runnerSandbox(test.http, params, runnerId, () => NOW).launchAgent(OPTIONS);

    expect(await jobState(scanId)).toBeUndefined();
  });
});
