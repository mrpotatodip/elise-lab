import { count, eq } from "drizzle-orm";
import { Effect } from "effect";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { authUser, platformRunnerDeviceLogins, tenantRunners } from "@repo/db-elise";
import { StartedRunnerLoginSchema, type StartRunnerLoginBody } from "@repo/contracts/elise";
import { asTenantEffect, openTestDb, seedTenant, type TestDb } from "#/__tests__/test-db";
import { approveRunnerLoginSvc, checkRunnerLoginSvc, claimJobSvc, runnerIdentitySvc, startRunnerLoginSvc } from "#/modules/runners/handlers";
import { hashPairingCode, hashRunnerToken } from "#/modules/runners/utils";

let test: TestDb;
let tenantId: string;
let userId: string;

const DASHBOARD = "https://app.eliselab.test";
const START: StartRunnerLoginBody = { name: "build-box", os: "linux 6.8", cpu: "x64", version: "0.1.0" };

const run = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(effect);
const start = () => run(startRunnerLoginSvc(test.http, START, { ip: "203.0.113.7", dashboardUrl: DASHBOARD }));
const approveEffect = (userCode: string, name: string) => asTenantEffect(test, tenantId, (db) => approveRunnerLoginSvc(db, tenantId, userId, "198.51.100.9", { userCode, name }));
const approve = (userCode: string, name = "Build box") => run(approveEffect(userCode, name));
const refusedApproval = (userCode: string) => run(Effect.flip(approveEffect(userCode, "Build box")).pipe(Effect.map((error) => error._tag)));
const check = (deviceCode: string) => run(checkRunnerLoginSvc(test.http, { deviceCode }));
const refusedCheck = (deviceCode: string) => run(Effect.flip(checkRunnerLoginSvc(test.http, { deviceCode })).pipe(Effect.map((error) => error._tag)));
const runnerCount = async () => (await test.raw.select({ n: count() }).from(tenantRunners))[0]?.n ?? 0;

beforeAll(async () => {
  test = await openTestDb();
  const seeded = await seedTenant(test, "acme");
  tenantId = seeded.tenantId;
  userId = crypto.randomUUID();
  await test.raw.insert(authUser).values({ id: userId, name: "Ada", email: "ada@example.com", emailVerified: true, partyId: seeded.partyId });
});

afterAll(async () => {
  await test.close();
});

describe("starting a Runner login", () => {
  it("answers a short user code, a link carrying it, a device code and a 10 minute expiry, and keeps only hashes", async () => {
    const before = Date.now();
    const started = StartedRunnerLoginSchema.parse(await start());
    const [row] = await test.raw.select().from(platformRunnerDeviceLogins).where(eq(platformRunnerDeviceLogins.userCodeHash, await hashPairingCode(started.userCode)));

    expect(started.userCode).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(started.verificationUrl).toBe(`${DASHBOARD}/device?code=${started.userCode}`);
    expect(Date.parse(started.expiresAt) - before).toBeGreaterThan(9 * 60 * 1000);
    expect(row).toMatchObject({ state: "pending", suggestedName: "build-box", os: "linux 6.8", cpu: "x64", runnerVersion: "0.1.0", requestIp: "203.0.113.7", tenantId: null, runnerId: null });
    expect(JSON.stringify(row)).not.toContain(started.deviceCode);
    expect(JSON.stringify(row)).not.toContain(started.userCode);
    expect(JSON.stringify(row)).not.toContain(started.userCode.replace("-", ""));
  });
});

describe("a Runner login from start to collection", () => {
  it("keeps the Runner waiting until a member approves, and approval makes a Runner with no token", async () => {
    const started = await start();
    expect(await check(started.deviceCode)).toEqual({ status: "pending" });
    expect(await runnerCount()).toBe(0);

    const approved = await approve(started.userCode.toLowerCase().replace("-", ""), "CI box");
    const [created] = await test.raw.select().from(tenantRunners).where(eq(tenantRunners.id, approved.runnerId));
    expect(created).toMatchObject({ tenantId, name: "CI box", tokenHash: null });
    expect(created?.createdBy).toBeTruthy();
    const [login] = await test.raw.select().from(platformRunnerDeviceLogins).where(eq(platformRunnerDeviceLogins.runnerId, approved.runnerId));
    expect(login).toMatchObject({ state: "approved", tenantId, approverIp: "198.51.100.9" });
  });
});

describe("collecting the token", () => {
  it("returns the token, Runner name and Account name on the first check after approval, once, stored only as a hash", async () => {
    const started = await start();
    const approved = await approve(started.userCode);
    const first = await check(started.deviceCode);

    if (first.status !== "approved") throw new Error("not collected");
    expect(first).toMatchObject({ runnerId: approved.runnerId, name: "Build box", accountId: tenantId, accountName: "acme" });
    expect(first.token).toMatch(/^elr_/);
    const [row] = await test.raw.select().from(tenantRunners).where(eq(tenantRunners.id, approved.runnerId));
    expect(row?.tokenHash).toBe(await hashRunnerToken(first.token));
    expect(JSON.stringify(row)).not.toContain(first.token);
    expect(await refusedCheck(started.deviceCode)).toBe("Forbidden");
    const identity = await run(runnerIdentitySvc(test.http, first.token));
    expect(identity).toMatchObject({ runnerId: approved.runnerId, accountId: tenantId });
    expect(await run(claimJobSvc(test.http, approved.runnerId))).toBeNull();
  });
});

describe("refusing a login", () => {
  it("refuses a user code nobody started, and makes no Runner", async () => {
    const before = await runnerCount();
    expect(await refusedApproval("ZZZZ-ZZZZ")).toBe("Forbidden");
    expect(await runnerCount()).toBe(before);
  });

  it("refuses a user code that was already approved, and makes no second Runner", async () => {
    const started = await start();
    await approve(started.userCode);
    const before = await runnerCount();
    expect(await refusedApproval(started.userCode)).toBe("Forbidden");
    expect(await runnerCount()).toBe(before);
  });

  it("refuses an expired login on approval and on check", async () => {
    const userCode = "ABCD-EFGH";
    await test.raw.insert(platformRunnerDeviceLogins).values({
      userCodeHash: await hashPairingCode(userCode),
      deviceCodeHash: await hashRunnerToken("expired-device-code"),
      suggestedName: "old",
      os: "linux",
      cpu: "x64",
      runnerVersion: "0.1.0",
      requestIp: "203.0.113.7",
      expiresAt: new Date(Date.now() - 1000),
    });
    expect(await refusedApproval(userCode)).toBe("Forbidden");
    expect(await refusedCheck("expired-device-code")).toBe("Forbidden");
  });

  it("refuses a device code nobody was given", async () => {
    expect(await refusedCheck("not-a-device-code")).toBe("Forbidden");
  });

  it("gives no token for a Runner an admin removed before it collected", async () => {
    const started = await start();
    const approved = await approve(started.userCode);
    await test.raw.update(tenantRunners).set({ revokedAt: new Date() }).where(eq(tenantRunners.id, approved.runnerId));
    expect(await refusedCheck(started.deviceCode)).toBe("Forbidden");
  });
});
