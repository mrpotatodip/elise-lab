import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { authUser, ensureTenantRoles, findTenantRole, parties, partyMasterTypes, partyPersons, partyRoles } from "@repo/db-elise";
import type { AccessPower } from "@repo/contracts/elise";
import { fakeBindings, testExecutionContext } from "#/__tests__/fake-bindings";
import { openTestDb, seedTenant, type TestDb } from "#/__tests__/test-db";
import { tenantRouteApp } from "#/__tests__/tenant-route-harness";
import type { QueuedEmail } from "#/modules/email";

let test: TestDb;
let tenantId: string;
let memberPartyId: string;
const queued: QueuedEmail[] = [];

const POWERS: ReadonlySet<AccessPower> = new Set<AccessPower>(["company:team:two_factor:reset", "company:team:two_factor_requirement:update"]);

const app = tenantRouteApp(() => test, {
  sessionUserId: async () => "owner",
  userHasPower: async (_c, _userId, _accountId, power) => POWERS.has(power),
  enqueueEmail: async (_env, mail) => {
    queued.push(mail);
  },
});

const call = (path: string, method: string, body?: { required: boolean }) => {
  const { env } = fakeBindings();
  const headers = new Headers({ authorization: "Bearer session-token", "x-account-id": tenantId });
  if (body !== undefined) headers.set("content-type", "application/json");
  return app.fetch(new Request(`http://localhost${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }), env, testExecutionContext);
};

const addPerson = async (id: string, roleKey: string) => {
  const role = await findTenantRole(test.raw, tenantId, roleKey);
  if (!role) throw new Error(`${roleKey} role missing`);
  const [personType] = await test.raw.select().from(partyMasterTypes).where(eq(partyMasterTypes.key, "person"));
  const [party] = await test.raw.insert(parties).values({ masterTypeId: personType.id }).returning();
  await test.raw.insert(partyPersons).values({ partyId: party.id, firstName: id, lastName: "Test" });
  await test.raw.insert(authUser).values({ id, name: id, email: `${id}@example.com`, emailVerified: true, partyId: party.id });
  await test.raw.insert(partyRoles).values({ partyId: party.id, tenantId, roleId: role.id, roleScope: "tenant" });
  return party.id;
};

beforeAll(async () => {
  test = await openTestDb();
  ({ tenantId } = await seedTenant(test, "acme"));
  await ensureTenantRoles(test.raw, tenantId);
  await addPerson("owner", "tenant_admin");
  await addPerson("ws-admin", "workspace_admin");
  memberPartyId = await addPerson("member", "workspace_member");
});

afterAll(async () => {
  await test.close();
});

beforeEach(() => {
  queued.length = 0;
});

describe("2FA reset notice", () => {
  it("queues one two-factor-reset message to the member reset, and to no one else", async () => {
    const res = await call(`/team/members/${memberPartyId}/two-factor/reset`, "POST");

    expect(res.status).toBe(200);
    expect(queued.map((mail) => [mail.kind, mail.to])).toEqual([["two-factor-reset", "member@example.com"]]);
  });

  it("queues nothing when the reset is refused", async () => {
    const ownerParty = (await test.raw.select({ id: authUser.partyId }).from(authUser).where(eq(authUser.id, "owner")))[0].id;
    const res = await call(`/team/members/${ownerParty}/two-factor/reset`, "POST");

    expect([res.status, queued.length]).toEqual([403, 0]);
  });
});

describe("requirement changed notice", () => {
  it("queues one message to every admin and to no member", async () => {
    const res = await call("/team/two-factor-requirement", "PUT", { required: true });

    expect(res.status).toBe(200);
    expect(queued.map((mail) => [mail.kind, mail.to]).toSorted()).toEqual([
      ["two-factor-requirement-changed", "owner@example.com"],
      ["two-factor-requirement-changed", "ws-admin@example.com"],
    ]);
  });
});
