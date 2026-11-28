import { Effect } from "effect";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { authUser, ensureTenantRoles, findTenantRole, partyRoles } from "@repo/db-elise";
import { openTestDb, seedTenant, type TestDb } from "#/__tests__/test-db";
import { getMeEffect } from "#/modules/me/queries";

let test: TestDb;
let first: string;
let second: string;

beforeAll(async () => {
  test = await openTestDb();
  first = (await seedTenant(test, "first")).tenantId;
  second = (await seedTenant(test, "second")).tenantId;
  const { partyId } = await seedTenant(test, "person");
  await test.raw.insert(authUser).values({ id: "me-user", name: "Ada", email: "ada@example.com", partyId });
  for (const tenantId of [first, second]) {
    await ensureTenantRoles(test.raw, tenantId);
    const role = await findTenantRole(test.raw, tenantId, "tenant_admin");
    if (!role) throw new Error("role missing");
    await test.raw.insert(partyRoles).values({ partyId, tenantId, roleId: role.id, roleScope: "tenant" });
  }
});

afterAll(async () => {
  await test.close();
});

describe("getMeEffect for a CLI access", () => {
  it("lists every Account of a session", async () => {
    const me = await Effect.runPromise(getMeEffect(test.http, "me-user"));

    expect(me.accounts.map((account) => account.id).toSorted()).toEqual([first, second].toSorted());
    expect(me.user.email).toBe("ada@example.com");
  });

  it("shows only the token's Account, no staff flag and no email", async () => {
    const me = await Effect.runPromise(getMeEffect(test.http, "me-user", second));

    expect(me.accounts.map((account) => account.id)).toEqual([second]);
    expect(me.isSuperuser).toBe(false);
    expect(me.user.email).toBe("");
  });
});
