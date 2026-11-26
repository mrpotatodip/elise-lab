import { Effect } from "effect";
import { eq, inArray } from "drizzle-orm";
import {
  authUser,
  platformMasterPlans,
  scanRunnerJobs,
  scans,
  tenantRunners,
  tenantSubscriptions,
} from "@repo/db-elise";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { fakeBindings } from "#/__tests__/fake-bindings";
import { callAs, tenantRouteApp } from "#/__tests__/tenant-route-harness";
import { openTestDb, scanValues, seedRepo, seedTenant, type TestDb } from "#/__tests__/test-db";
import { realAppDeps } from "#/lib/app-deps";
import type { ScanOptions } from "#/schemas";
import {
  RESUME_ACTIVE_MESSAGE,
  RESUME_CLOUD_MESSAGE,
  RESUME_POOL_SPENT_MESSAGE,
  RESUME_SUCCEEDED_MESSAGE,
} from "#/modules/scans/constants";
import { claimJobSvc } from "#/modules/runners/handlers";
import { runnerSandbox } from "#/modules/runners/lib";
import { claimPairingEffect, createRunnerEffect } from "#/modules/runners/queries";

let test: TestDb;
let tenantId: string;
let otherTenantId: string;
let runnerId: string;
let otherRunnerId: string;
let removedRunnerId: string;
let userId: string;
let counter = 0;

const app = tenantRouteApp(() => test, {
  sessionUserId: async () => "admin-user",
  connectedRunnerSources: realAppDeps.connectedRunnerSources,
});
const NOW = new Date("2026-11-25T09:00:00Z");
const OPTIONS: ScanOptions = {
  skill: "full",
  model: "claude-sonnet-5-5",
  effort: "high",
  profile: "standard",
  maxBudgetUsd: 7,
  scopePaths: ["apps/api"],
};
const QueuedBodySchema = z.object({
  data: z.object({ scanId: z.string(), status: z.string(), profile: z.string(), maxBudgetUsd: z.number() }).nullable(),
  error: z.object({ message: z.string() }).nullable(),
});
const ChainBodySchema = z.object({
  data: z.object({ resumesScanId: z.string().nullish(), resumedByScanId: z.string().nullish() }),
});

const run = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(effect);

const newRunner = async (name: string) => {
  const created = await run(
    createRunnerEffect(test.http, {
      tenantId,
      actorUserId: userId,
      name,
      codeHash: `${name}-code`,
      expiresAt: new Date("2026-11-25T10:00:00Z"),
    }),
  );
  await run(claimPairingEffect(test.http, { codeHash: `${name}-code`, tokenHash: `${name}-token`, now: NOW }));
  return created.id;
};

type Seeded = { status?: "failed" | "stopped" | "succeeded" | "running"; error?: string | null; withJob?: boolean };

const seedScan = async (
  { status = "failed", error = "the agent crashed", withJob = true }: Seeded = {},
  on = runnerId,
) => {
  counter += 1;
  const scanId = `resume-scan-${counter}`;
  const repoId = await seedRepo(test, tenantId, `https://github.com/octocat/resume-${counter}`);
  await test.raw.insert(scans).values(
    scanValues(tenantId, repoId, scanId, NOW.toISOString(), {
      status,
      skill: "full",
      model: OPTIONS.model,
      effort: OPTIONS.effort,
      profile: "standard",
      maxBudgetUsd: "7.00",
      ref: "main",
      error,
      costUsd: "3.2000",
      updatedAt: NOW,
    }),
  );
  if (withJob)
    await test.raw.insert(scanRunnerJobs).values({
      scanId,
      tenantId,
      runnerId: on,
      state: status === "stopped" ? "cancelled" : "failed",
      repoUrl: "https://github.com/octocat/Hello-World",
      ref: "main",
      prompt: "p",
      optionsJson: JSON.stringify(OPTIONS),
      priorsJson: "",
    });
  return scanId;
};

const resume = (scanId: string, as = tenantId) => {
  const bindings = fakeBindings();
  return { bindings, res: callAs(app, as, `/scans/${scanId}/resume`, { method: "POST", env: bindings.env }) };
};
const rowOf = async (scanId: string) => (await test.raw.select().from(scans).where(eq(scans.id, scanId)))[0];

beforeAll(async () => {
  test = await openTestDb();
  const seeded = await seedTenant(test, "resume-account");
  tenantId = seeded.tenantId;
  otherTenantId = (await seedTenant(test, "resume-other")).tenantId;
  const [pro] = await test.raw.select().from(platformMasterPlans).where(eq(platformMasterPlans.key, "pro"));
  await test.raw.insert(tenantSubscriptions).values({ tenantId, planId: pro.id, status: "active", source: "grant" });
  userId = crypto.randomUUID();
  await test.raw
    .insert(authUser)
    .values({ id: userId, name: "Ada", email: "resume@example.com", emailVerified: true, partyId: seeded.partyId });
  runnerId = await newRunner("resumer");
  otherRunnerId = await newRunner("bystander");
  removedRunnerId = await newRunner("goner");
  await test.raw.update(tenantRunners).set({ revokedAt: NOW }).where(eq(tenantRunners.id, removedRunnerId));
});

afterEach(async () => {
  await test.raw
    .update(scans)
    .set({ status: "failed" })
    .where(inArray(scans.status, ["queued", "running"]));
});

afterAll(async () => {
  await test.close();
});

describe("resuming a Scan", () => {
  it.each(["failed", "stopped"] as const)(
    "makes a new queued Scan after a %s Runner Scan with the same profile, ref and cap, and leaves the old row alone",
    async (status) => {
      const old = await seedScan({ status, error: status === "failed" ? "the agent crashed" : null });
      const before = await rowOf(old);
      const { res, bindings } = resume(old);
      const response = await res;
      const body = QueuedBodySchema.parse(await response.json());

      expect(response.status).toBe(201);
      expect(body.data).toMatchObject({ status: "queued", profile: "standard", maxBudgetUsd: 7 });
      const created = await rowOf(body.data?.scanId ?? "");
      expect(created).toMatchObject({ resumesScanId: old, ref: "main", maxBudgetUsd: "7.00", status: "queued" });
      expect(bindings.createdFull[0].params).toMatchObject({
        resumesScanId: old,
        runnerId,
        options: { scopePaths: ["apps/api"], maxBudgetUsd: 7 },
      });
      expect(await rowOf(old)).toEqual(before);
    },
  );

  it("shows the chain of attempts on both Scans", async () => {
    const old = await seedScan();
    const { res } = resume(old);
    const created = QueuedBodySchema.parse(await (await res).json()).data?.scanId ?? "";

    const first = ChainBodySchema.parse(await (await callAs(app, tenantId, `/scans/${old}`)).json());
    const second = ChainBodySchema.parse(await (await callAs(app, tenantId, `/scans/${created}`)).json());

    expect(first.data).toMatchObject({ resumedByScanId: created });
    expect(first.data.resumesScanId ?? null).toBeNull();
    expect(second.data).toMatchObject({ resumesScanId: old });
  });

  it("hands the job only to the Runner that ran the first attempt, with the resume marker", async () => {
    const old = await seedScan();
    const { res, bindings } = resume(old);
    await res;
    const { params } = bindings.createdFull[0];
    await runnerSandbox(test.http, params, params.runnerId ?? "", () => NOW).launchAgent(params.options);

    expect(await run(claimJobSvc(test.http, otherRunnerId))).toBeNull();
    const claimed = await run(claimJobSvc(test.http, runnerId));
    expect(claimed).toMatchObject({ scanId: params.scanId, resume: true, resumesScanId: old, maxBudgetUsd: 7 });
  });

  it("gives a normal job no resume fields", async () => {
    const counterRepo = await seedRepo(test, tenantId, "https://github.com/octocat/plain-job");
    const scanId = "resume-plain-job";
    await test.raw
      .insert(scans)
      .values(scanValues(tenantId, counterRepo, scanId, NOW.toISOString(), { status: "queued" }));
    await runnerSandbox(
      test.http,
      {
        scanId,
        accountId: tenantId,
        repo: "https://github.com/octocat/plain-job",
        options: OPTIONS,
        runnerId,
        createdAt: NOW.toISOString(),
      },
      runnerId,
      () => NOW,
    ).launchAgent(OPTIONS);

    const claimed = await run(claimJobSvc(test.http, runnerId));

    expect(claimed?.scanId).toBe(scanId);
    expect(claimed?.resume).toBeUndefined();
    expect(claimed?.resumesScanId).toBeUndefined();
  });

  it.each([
    { name: "a succeeded Scan", seed: { status: "succeeded" as const }, code: 409, message: RESUME_SUCCEEDED_MESSAGE },
    {
      name: "a Scan that is still running",
      seed: { status: "running" as const, error: null },
      code: 409,
      message: RESUME_ACTIVE_MESSAGE,
    },
    {
      name: "a Scan whose Pool was spent",
      seed: { error: "the scan's budget is spent" },
      code: 409,
      message: RESUME_POOL_SPENT_MESSAGE,
    },
    { name: "a cloud Scan", seed: { withJob: false }, code: 400, message: RESUME_CLOUD_MESSAGE },
  ])("refuses $name and creates no Scan", async ({ seed, code, message }) => {
    const old = await seedScan(seed);
    const before = await test.raw.select({ id: scans.id }).from(scans).where(eq(scans.tenantId, tenantId));
    const response = await resume(old).res;

    expect(response.status).toBe(code);
    const said = QueuedBodySchema.parse(await response.json()).error?.message;
    expect(said).toBe(message);
    expect(await test.raw.select({ id: scans.id }).from(scans).where(eq(scans.tenantId, tenantId))).toHaveLength(
      before.length,
    );
  });

  it("refuses a Scan that already has a Resumed Scan", async () => {
    const old = await seedScan();
    const first = await resume(old).res;
    const second = await resume(old).res;

    expect(first.status).toBe(201);
    expect(second.status).toBe(409);
  });

  it("refuses while the Repo has another active Scan", async () => {
    const old = await seedScan();
    const { repoId } = await rowOf(old);
    await test.raw
      .insert(scans)
      .values(
        scanValues(tenantId, repoId, "resume-blocker", NOW.toISOString(), { status: "running", updatedAt: new Date() }),
      );
    const response = await resume(old).res;

    expect(response.status).toBe(409);
    expect(QueuedBodySchema.parse(await response.json()).error?.message).toContain("active scan");
    await test.raw.update(scans).set({ status: "failed" }).where(eq(scans.id, "resume-blocker"));
  });

  it("refuses a Runner Scan whose Runner was removed, and says why", async () => {
    const old = await seedScan({}, removedRunnerId);
    const response = await resume(old).res;

    expect(response.status).toBe(400);
    expect(QueuedBodySchema.parse(await response.json()).error?.message).toContain("Runner");
  });

  it("refuses an Account at its live-Scan limit", async () => {
    const old = await seedScan();
    const filler: string[] = [];
    for (const index of [1, 2, 3]) {
      const repoId = await seedRepo(test, tenantId, `https://github.com/octocat/live-${index}`);
      const id = `resume-live-${index}`;
      filler.push(id);
      await test.raw.insert(scans).values(
        scanValues(tenantId, repoId, id, NOW.toISOString(), {
          status: "running",
          skill: "full",
          updatedAt: new Date(),
        }),
      );
      await test.raw.insert(scanRunnerJobs).values({
        scanId: id,
        tenantId,
        runnerId,
        state: "claimed",
        repoUrl: "https://github.com/octocat/x",
        prompt: "p",
        optionsJson: "{}",
        priorsJson: "",
      });
    }
    const response = await resume(old).res;

    expect(response.status).toBe(429);
    for (const id of filler) await test.raw.update(scans).set({ status: "failed" }).where(eq(scans.id, id));
  });

  it("does not find a Scan of another Account", async () => {
    const old = await seedScan();
    const response = await resume(old, otherTenantId).res;

    expect(response.status).toBe(404);
  });
});
