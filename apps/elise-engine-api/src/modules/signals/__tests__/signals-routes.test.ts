import { authUser } from "@repo/db-elise";
import { accessAuditLog, scanSignals, tenants } from "@repo/db-elise/schema";
import { and, asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { SignalSchema, SignalsSettingsSchema, type AccessPower } from "@repo/contracts/elise";
import { fakeBindings, TEST_TOKEN, testExecutionContext } from "#/__tests__/fake-bindings";
import { openTestDb, seedRepo, seedTenant, type TestDb } from "#/__tests__/test-db";
import { tenantRouteApp } from "#/__tests__/tenant-route-harness";

let test: TestDb;
let tenantId: string;
let otherTenantId: string;
let repoId: string;
let partyId: string;
let held: ReadonlySet<AccessPower>;

const REPO = "https://github.com/octocat/Hello-World";
const MEMBER: ReadonlySet<AccessPower> = new Set<AccessPower>(["company:dashboard:read", "company:summary:read"]);
const ADMIN: ReadonlySet<AccessPower> = new Set<AccessPower>([...MEMBER, "company:signals:update"]);
const WATCHER: ReadonlySet<AccessPower> = new Set<AccessPower>(["company:summary:read"]);

const app = tenantRouteApp(() => test, {
  sessionUserId: async () => "ada",
  userHasPower: async (_c, _userId, _accountId, power) => held.has(power),
});

const call = (path: string, init: { method?: string; body?: unknown; token?: boolean } = {}) => {
  const { env } = fakeBindings();
  const headers = new Headers({
    authorization: `Bearer ${init.token ? TEST_TOKEN : "session-token"}`,
    "x-account-id": tenantId,
  });
  if (init.body !== undefined) headers.set("content-type", "application/json");
  const body = init.body === undefined ? undefined : JSON.stringify(init.body);
  return app.fetch(
    new Request(`http://localhost${path}`, { method: init.method, headers, body }),
    env,
    testExecutionContext,
  );
};

const setSwitch = (enabled: boolean) => call("/usage/signals", { method: "PUT", body: { enabled } });
const switchOf = async () =>
  z.object({ data: SignalsSettingsSchema }).parse(await (await call("/usage/signals")).json()).data.enabled;
const shown = async () =>
  z.object({ data: z.array(SignalSchema) }).parse(await (await call(`/findings/signals?repo=${REPO}`)).json()).data;

const switchEntries = () =>
  test.raw
    .select()
    .from(accessAuditLog)
    .where(and(eq(accessAuditLog.subjectId, tenantId), eq(accessAuditLog.action, "signals.switched")))
    .orderBy(asc(accessAuditLog.createdAt));

const seedSignal = async (overrides: Partial<typeof scanSignals.$inferInsert> = {}) => {
  const [row] = await test.raw
    .insert(scanSignals)
    .values({
      tenantId,
      repoId,
      fingerprint: "a".repeat(64),
      relatedFingerprint: "b".repeat(64),
      kind: "possible_duplicate",
      probability: 0.9,
      modelVersion: "jev-1.14.0",
      ...overrides,
    })
    .returning();
  return row.id;
};

beforeAll(async () => {
  test = await openTestDb();
  const seeded = await seedTenant(test, "acme");
  tenantId = seeded.tenantId;
  partyId = seeded.partyId;
  repoId = await seedRepo(test, tenantId);
  otherTenantId = (await seedTenant(test, "other")).tenantId;
  await test.raw.insert(authUser).values({ id: "ada", name: "Ada Rossi", email: "ada@example.com", partyId });
});

afterAll(async () => {
  await test.close();
});

beforeEach(async () => {
  held = ADMIN;
  await test.raw.delete(scanSignals);
  await test.raw.update(tenants).set({ signalsEnabled: true });
});

describe("the Signals switch", () => {
  it("reads on for an Account that never set it", async () => {
    expect(await switchOf()).toBe(true);
  });

  it("lets a holder of the Signals Power turn it off and writes the Audit trail", async () => {
    const res = await setSwitch(false);
    const entry = (await switchEntries()).at(-1);

    expect([res.status, await switchOf()]).toEqual([200, false]);
    expect(entry).toMatchObject({
      action: "signals.switched",
      actorPartyId: partyId,
      before: { enabled: true },
      after: { tenantId, enabled: false },
    });
  });

  it("refuses a member without the Power and changes nothing", async () => {
    held = MEMBER;
    const entriesBefore = (await switchEntries()).length;
    const res = await setSwitch(false);

    expect([res.status, await switchOf(), (await switchEntries()).length]).toEqual([403, true, entriesBefore]);
  });

  it("leaves another Account's switch alone", async () => {
    await setSwitch(false);
    const [other] = await test.raw.select().from(tenants).where(eq(tenants.id, otherTenantId));

    expect(other.signalsEnabled).toBe(true);
  });
});

describe("reading Signals", () => {
  it("returns the stored Signals of the repo", async () => {
    await seedSignal();

    expect((await shown()).map((signal) => [signal.kind, signal.probability, signal.modelVersion])).toEqual([
      ["possible_duplicate", 0.9, "jev-1.14.0"],
    ]);
  });

  it("hides every Signal while the switch is off and shows them again when it is on", async () => {
    await seedSignal();
    await setSwitch(false);
    const hidden = await shown();
    await setSwitch(true);

    expect([hidden, (await shown()).length]).toEqual([[], 1]);
    expect(await test.raw.select().from(scanSignals)).toHaveLength(1);
  });

  it("refuses a Watcher", async () => {
    held = WATCHER;
    await seedSignal();

    expect((await call(`/findings/signals?repo=${REPO}`)).status).toBe(403);
  });
});

describe("dismissing a Signal", () => {
  it("hides it for the Account and keeps the row", async () => {
    const id = await seedSignal();
    const res = await call(`/findings/signals/${id}/dismiss`, { method: "POST" });

    expect([res.status, await shown()]).toEqual([200, []]);
    expect((await test.raw.select().from(scanSignals))[0].dismissedAt).not.toBeNull();
  });
});
