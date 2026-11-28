import { count, eq } from "drizzle-orm";
import { Effect } from "effect";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { accessAuditLog, authUser, platformRunnerDeviceLogins, tenantRunners } from "@repo/db-elise";
import { StartedRunnerLoginSchema, type StartRunnerLoginBody } from "@repo/contracts/elise";
import { asTenantEffect, openTestDb, seedTenant, type TestDb } from "#/__tests__/test-db";
import {
  approveRunnerLoginSvc,
  checkRunnerLoginSvc,
  claimJobSvc,
  denyRunnerLoginSvc,
  lookupRunnerLoginSvc,
  runnerIdentitySvc,
  startRunnerLoginSvc,
} from "#/modules/runners/handlers";
import { hashDeviceCode, hashPairingCode, hashRunnerToken } from "#/modules/runners/utils";

let test: TestDb;
let tenantId: string;
let userId: string;

const DASHBOARD = "https://app.eliselab.test";
const START: StartRunnerLoginBody = { name: "build-box", os: "linux 6.8", cpu: "x64", version: "0.1.0" };

const run = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(effect);
const start = () => run(startRunnerLoginSvc(test.http, START, { ip: "203.0.113.7", dashboardUrl: DASHBOARD }));
const approveEffect = (userCode: string, name: string) =>
  asTenantEffect(test, tenantId, (db) =>
    approveRunnerLoginSvc(db, tenantId, userId, "198.51.100.9", { userCode, name, runScans: true, cliScope: null }),
  );
const approve = async (userCode: string, name = "Build box") => {
  const approved = await run(approveEffect(userCode, name));
  return { ...approved, runnerId: approved.runnerId ?? "" };
};
const refusedApproval = (userCode: string) =>
  run(Effect.flip(approveEffect(userCode, "Build box")).pipe(Effect.map((error) => error._tag)));
const check = (deviceCode: string) => run(checkRunnerLoginSvc(test.http, { deviceCode }));
const refusedCheck = (deviceCode: string) =>
  run(Effect.flip(checkRunnerLoginSvc(test.http, { deviceCode })).pipe(Effect.map((error) => error._tag)));
const denyEffect = (userCode: string) =>
  asTenantEffect(test, tenantId, (db) => denyRunnerLoginSvc(db, tenantId, userId, "198.51.100.9", { userCode }));
const refusedDenial = (userCode: string) =>
  run(Effect.flip(denyEffect(userCode)).pipe(Effect.map((error) => error._tag)));
const insertExpiredLogin = async (userCode: string, deviceCode: string) => {
  const [row] = await test.raw
    .insert(platformRunnerDeviceLogins)
    .values({
      userCodeHash: await hashPairingCode(userCode),
      deviceCodeHash: await hashDeviceCode(deviceCode),
      suggestedName: "old",
      os: "linux",
      cpu: "x64",
      runnerVersion: "0.1.0",
      requestIp: "203.0.113.7",
      expiresAt: new Date(Date.now() - 1000),
    })
    .returning({ id: platformRunnerDeviceLogins.id });
  return row?.id ?? "";
};
const expireLogin = (userCode: string) =>
  hashPairingCode(userCode).then((hash) =>
    test.raw
      .update(platformRunnerDeviceLogins)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(platformRunnerDeviceLogins.userCodeHash, hash)),
  );
const waitedLongEnough = (userCode: string) =>
  hashPairingCode(userCode).then((hash) =>
    test.raw
      .update(platformRunnerDeviceLogins)
      .set({ lastCheckedAt: new Date(Date.now() - 60_000) })
      .where(eq(platformRunnerDeviceLogins.userCodeHash, hash)),
  );
const runnerCount = async () => (await test.raw.select({ n: count() }).from(tenantRunners))[0]?.n ?? 0;

beforeAll(async () => {
  test = await openTestDb();
  const seeded = await seedTenant(test, "acme");
  tenantId = seeded.tenantId;
  userId = crypto.randomUUID();
  await test.raw
    .insert(authUser)
    .values({ id: userId, name: "Ada", email: "ada@example.com", emailVerified: true, partyId: seeded.partyId });
});

afterAll(async () => {
  await test.close();
});

describe("starting a Runner login", () => {
  it("answers a short user code, a link carrying it, a device code and a 10 minute expiry, and keeps only hashes", async () => {
    const before = Date.now();
    const started = StartedRunnerLoginSchema.parse(await start());
    const [row] = await test.raw
      .select()
      .from(platformRunnerDeviceLogins)
      .where(eq(platformRunnerDeviceLogins.userCodeHash, await hashPairingCode(started.userCode)));

    expect(started.userCode).toMatch(/^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
    expect(started.verificationUrl).toBe(`${DASHBOARD}/device?code=${started.userCode}`);
    expect(Date.parse(started.expiresAt) - before).toBeGreaterThan(9 * 60 * 1000);
    expect(row).toMatchObject({
      state: "pending",
      suggestedName: "build-box",
      os: "linux 6.8",
      cpu: "x64",
      runnerVersion: "0.1.0",
      requestIp: "203.0.113.7",
      tenantId: null,
      runnerId: null,
    });
    expect(JSON.stringify(row)).not.toContain(started.deviceCode);
    expect(JSON.stringify(row)).not.toContain(started.userCode);
    expect(JSON.stringify(row)).not.toContain(started.userCode.replace("-", ""));
  });
});

describe("reading a pending login for the approval page", () => {
  it("answers the suggested name, OS, CPU, version, requesting IP and expiry, in any spelling of the code, and nothing secret", async () => {
    const started = await start();
    const found = await run(lookupRunnerLoginSvc(test.http, started.userCode.toLowerCase().replace("-", "")));

    expect(found).toMatchObject({
      suggestedName: "build-box",
      os: "linux 6.8",
      cpu: "x64",
      version: "0.1.0",
      requestIp: "203.0.113.7",
      expiresAt: started.expiresAt,
    });
    expect(Object.keys(found).toSorted()).toEqual(["cpu", "expiresAt", "os", "requestIp", "suggestedName", "version"]);
  });

  it("refuses an unknown code, an approved login and an expired login alike", async () => {
    const approvedLogin = await start();
    await test.raw
      .update(platformRunnerDeviceLogins)
      .set({ state: "approved" })
      .where(eq(platformRunnerDeviceLogins.userCodeHash, await hashPairingCode(approvedLogin.userCode)));
    await test.raw.insert(platformRunnerDeviceLogins).values({
      userCodeHash: await hashPairingCode("LOOK-EXPD"),
      deviceCodeHash: await hashRunnerToken("lookup-expired-device-code"),
      suggestedName: "old",
      os: "linux",
      cpu: "x64",
      runnerVersion: "0.1.0",
      requestIp: "203.0.113.7",
      expiresAt: new Date(Date.now() - 1000),
    });
    const refusal = (code: string) =>
      run(Effect.flip(lookupRunnerLoginSvc(test.http, code)).pipe(Effect.map((error) => error._tag)));

    expect([await refusal("ZZZZ-ZZZZ"), await refusal(approvedLogin.userCode), await refusal("LOOK-EXPD")]).toEqual([
      "Forbidden",
      "Forbidden",
      "Forbidden",
    ]);
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
    const [login] = await test.raw
      .select()
      .from(platformRunnerDeviceLogins)
      .where(eq(platformRunnerDeviceLogins.runnerId, approved.runnerId));
    expect(login).toMatchObject({ state: "approved", tenantId, approverIp: "198.51.100.9" });
  });
});

describe("the Audit trail of an approved login", () => {
  it("writes one entry with the approver, the Account, the Runner name and both IPs, and none for a refused approval", async () => {
    const started = await start();
    const approved = await approve(started.userCode, "Audit box");
    const entries = await test.raw.select().from(accessAuditLog).where(eq(accessAuditLog.subjectId, approved.runnerId));
    const [created] = await test.raw.select().from(tenantRunners).where(eq(tenantRunners.id, approved.runnerId));

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      actorPartyId: created?.createdBy,
      action: "runner.login.approve",
      after: { tenantId, name: "Audit box", requestIp: "203.0.113.7", approverIp: "198.51.100.9" },
    });
    await refusedApproval(started.userCode);
    expect(
      await test.raw.select().from(accessAuditLog).where(eq(accessAuditLog.subjectId, approved.runnerId)),
    ).toHaveLength(1);
  });
});

describe("collecting the token", () => {
  it("returns the token, Runner name and Account name on the first check after approval, once, stored only as a hash", async () => {
    const started = await start();
    const approved = await approve(started.userCode);
    const first = await check(started.deviceCode);

    if (first.status !== "approved") throw new Error("not collected");
    expect(first).toMatchObject({
      runnerId: approved.runnerId,
      name: "Build box",
      accountId: tenantId,
      accountName: "acme",
    });
    const token = first.token ?? "";
    expect(token).toMatch(/^elr_/);
    const [row] = await test.raw.select().from(tenantRunners).where(eq(tenantRunners.id, approved.runnerId));
    expect(row?.tokenHash).toBe(await hashRunnerToken(token));
    expect(JSON.stringify(row)).not.toContain(token);
    expect(await refusedCheck(started.deviceCode)).toBe("Forbidden");
    const identity = await run(runnerIdentitySvc(test.http, token));
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

  it("refuses an expired login on approval and denial, and answers expired on check", async () => {
    const userCode = "ABCD-EFGH";
    await insertExpiredLogin(userCode, "expired-device-code");
    expect(await refusedApproval(userCode)).toBe("Forbidden");
    expect(await refusedDenial(userCode)).toBe("Forbidden");
    expect(await check("expired-device-code")).toEqual({ status: "expired" });
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

describe("denying a login", () => {
  it("ends the wait with denied, makes no Runner, and writes one Audit trail entry like an approval", async () => {
    const started = await start();
    const before = await runnerCount();
    expect(await run(denyEffect(started.userCode.toLowerCase()))).toEqual({ denied: true });
    const [login] = await test.raw
      .select()
      .from(platformRunnerDeviceLogins)
      .where(eq(platformRunnerDeviceLogins.userCodeHash, await hashPairingCode(started.userCode)));
    const entries = await test.raw
      .select()
      .from(accessAuditLog)
      .where(eq(accessAuditLog.subjectId, login?.id ?? ""));

    expect(await check(started.deviceCode)).toEqual({ status: "denied" });
    expect(await runnerCount()).toBe(before);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      action: "runner.login.deny",
      after: { tenantId, name: "build-box", requestIp: "203.0.113.7", approverIp: "198.51.100.9" },
    });
  });

  it("refuses an unknown, approved or already denied code, and a denied code cannot be approved", async () => {
    const approvedLogin = await start();
    await approve(approvedLogin.userCode);
    const deniedLogin = await start();
    await run(denyEffect(deniedLogin.userCode));

    expect([
      await refusedDenial("ZZZZ-ZZZZ"),
      await refusedDenial(approvedLogin.userCode),
      await refusedDenial(deniedLogin.userCode),
      await refusedApproval(deniedLogin.userCode),
    ]).toEqual(["Forbidden", "Forbidden", "Forbidden", "Forbidden"]);
  });
});

describe("a login that expires", () => {
  it("removes the Runner an uncollected approval made, on the next check, and keeps answering expired", async () => {
    const started = await start();
    const approved = await approve(started.userCode);
    await expireLogin(started.userCode);

    expect(await check(started.deviceCode)).toEqual({ status: "expired" });
    expect(await test.raw.select().from(tenantRunners).where(eq(tenantRunners.id, approved.runnerId))).toHaveLength(0);
    expect(await check(started.deviceCode)).toEqual({ status: "expired" });
  });
});

describe("collecting once", () => {
  it("gives a second check nothing, even after the interval", async () => {
    const started = await start();
    await approve(started.userCode);
    expect((await check(started.deviceCode)).status).toBe("approved");
    await waitedLongEnough(started.userCode);

    expect(await refusedCheck(started.deviceCode)).toBe("Forbidden");
  });
});

describe("checking too early", () => {
  it("answers slow_down and adds 5 seconds to the interval each time, and keeps the answer once the Runner waits", async () => {
    const started = await start();
    expect(await check(started.deviceCode)).toEqual({ status: "pending" });
    expect(await check(started.deviceCode)).toEqual({ status: "slow_down", interval: 10 });
    expect(await check(started.deviceCode)).toEqual({ status: "slow_down", interval: 15 });
    await waitedLongEnough(started.userCode);
    expect(await check(started.deviceCode)).toEqual({ status: "pending" });
  });
});

describe("cleaning up expired logins", () => {
  it("deletes them with the Runner an uncollected approval made, and leaves live logins and collected Runners", async () => {
    const dead = await start();
    const deadApproved = await approve(dead.userCode);
    await expireLogin(dead.userCode);
    const collected = await start();
    const collectedApproved = await approve(collected.userCode);
    const collectedCheck = await check(collected.deviceCode);
    await expireLogin(collected.userCode);
    const live = await start();
    await insertExpiredLogin("CLEA-NUPA", "cleanup-device-code");
    await start();
    const logins = await test.raw
      .select({ userCodeHash: platformRunnerDeviceLogins.userCodeHash })
      .from(platformRunnerDeviceLogins);
    const hashes = logins.map((row) => row.userCodeHash);

    expect(collectedCheck.status).toBe("approved");
    expect(hashes).toContain(await hashPairingCode(live.userCode));
    expect(hashes).not.toContain(await hashPairingCode(dead.userCode));
    expect(hashes).not.toContain(await hashPairingCode(collected.userCode));
    expect(hashes).not.toContain(await hashPairingCode("CLEA-NUPA"));
    expect(await test.raw.select().from(tenantRunners).where(eq(tenantRunners.id, deadApproved.runnerId))).toHaveLength(
      0,
    );
    expect(
      await test.raw.select().from(tenantRunners).where(eq(tenantRunners.id, collectedApproved.runnerId)),
    ).toHaveLength(1);
  });
});
