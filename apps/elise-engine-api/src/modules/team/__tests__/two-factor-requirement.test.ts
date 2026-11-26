import { and, asc, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { TeamListSchema, TeamTwoFactorRequirementSchema, type AccessPower } from "@repo/contracts/elise";
import { accessAuditLog, authUser, ensureTenantRoles, findTenantRole, partyRoles, tenants } from "@repo/db-elise";
import { fakeBindings, testExecutionContext } from "#/__tests__/fake-bindings";
import { openTestDb, seedTenant, type TestDb } from "#/__tests__/test-db";
import { tenantRouteApp } from "#/__tests__/tenant-route-harness";
import { twoFactorStatusEffect } from "#/modules/two-factor";
import { Effect } from "effect";

let test: TestDb;
let tenantId: string;
let otherTenantId: string;
let ownerPartyId: string;
let held: ReadonlySet<AccessPower>;

const OWNER: ReadonlySet<AccessPower> = new Set<AccessPower>([
  "company:team:members:read",
  "company:team:two_factor_requirement:update",
]);
const WORKSPACE_ADMIN: ReadonlySet<AccessPower> = new Set<AccessPower>(["company:team:members:read"]);

const app = tenantRouteApp(() => test, {
  sessionUserId: async () => "owner",
  userHasPower: async (_c, _userId, _accountId, power) => held.has(power),
});

const call = (path: string, init: { method?: string; body?: unknown } = {}) => {
  const { env } = fakeBindings();
  const headers = new Headers({ authorization: "Bearer session-token", "x-account-id": tenantId });
  if (init.body !== undefined) headers.set("content-type", "application/json");
  const body = init.body === undefined ? undefined : JSON.stringify(init.body);
  return app.fetch(
    new Request(`http://localhost${path}`, { method: init.method, headers, body }),
    env,
    testExecutionContext,
  );
};

const setRequired = (required: boolean) => call("/team/two-factor-requirement", { method: "PUT", body: { required } });
const requiredNow = async () =>
  TeamTwoFactorRequirementSchema.parse(
    z.object({ data: z.unknown() }).parse(await (await call("/team/two-factor-requirement")).json()).data,
  ).required;
const entries = () =>
  test.raw
    .select()
    .from(accessAuditLog)
    .where(and(eq(accessAuditLog.subjectId, tenantId), eq(accessAuditLog.action, "team.two_factor_requirement.set")))
    .orderBy(asc(accessAuditLog.createdAt));

const addMember = async (id: string, twoFactorEnabled: boolean) => {
  const { partyId } = await seedTenant(test, `person-${id}`);
  const role = await findTenantRole(test.raw, tenantId, "workspace_member");
  if (!role) throw new Error("workspace_member role missing");
  await test.raw.insert(authUser).values({ id, name: id, email: `${id}@example.com`, partyId, twoFactorEnabled });
  await test.raw.insert(partyRoles).values({ partyId, tenantId, roleId: role.id, roleScope: "tenant" });
};

beforeAll(async () => {
  test = await openTestDb();
  const seeded = await seedTenant(test, "acme");
  tenantId = seeded.tenantId;
  ownerPartyId = seeded.partyId;
  otherTenantId = (await seedTenant(test, "other")).tenantId;
  await ensureTenantRoles(test.raw, tenantId);
  await test.raw.insert(authUser).values({
    id: "owner",
    name: "Ada Rossi",
    email: "ada@example.com",
    partyId: ownerPartyId,
    twoFactorEnabled: true,
  });
  await addMember("with-2fa", true);
  await addMember("without-2fa", false);
});

afterAll(async () => {
  await test.close();
});

beforeEach(async () => {
  held = OWNER;
  await test.raw.update(tenants).set({ twoFactorRequired: false });
});

describe("the Two-factor requirement", () => {
  it("reads off for an Account that never set it", async () => {
    expect(await requiredNow()).toBe(false);
  });

  it("lets the holder of the Power turn it on and writes the Audit trail", async () => {
    const res = await setRequired(true);
    const entry = (await entries()).at(-1);

    expect([res.status, await requiredNow()]).toEqual([200, true]);
    expect(entry).toMatchObject({
      actorPartyId: ownerPartyId,
      before: { required: false },
      after: { tenantId, required: true },
    });
  });

  it("refuses a member without the Power, who can still read it, and changes nothing", async () => {
    held = WORKSPACE_ADMIN;
    const entriesBefore = (await entries()).length;
    const res = await setRequired(true);

    expect([res.status, await requiredNow(), (await entries()).length]).toEqual([403, false, entriesBefore]);
  });

  it("leaves another Account alone", async () => {
    await setRequired(true);
    const [other] = await test.raw.select().from(tenants).where(eq(tenants.id, otherTenantId));

    expect(other.twoFactorRequired).toBe(false);
  });

  it("gates a member without Two-factor while it is on, and not the member who has it", async () => {
    const statusOf = (id: string) => Effect.runPromise(twoFactorStatusEffect(test.http, id));
    await setRequired(true);
    const on = [(await statusOf("without-2fa")).setupRequired, (await statusOf("with-2fa")).setupRequired];
    await setRequired(false);

    expect([on, (await statusOf("without-2fa")).setupRequired]).toEqual([[true, false], false]);
  });
});

describe("GET /team", () => {
  it("reports who has Two-factor", async () => {
    const res = await call("/team");
    const { members } = z.object({ data: TeamListSchema }).parse(await res.json()).data;

    expect(Object.fromEntries(members.map((member) => [member.name, member.twoFactorEnabled]))).toMatchObject({
      "with-2fa": true,
      "without-2fa": false,
    });
  });
});
