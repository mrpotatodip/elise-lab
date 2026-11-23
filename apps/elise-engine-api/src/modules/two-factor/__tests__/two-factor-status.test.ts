import { Effect } from "effect";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { authUser, ensureTenantRoles, findTenantRole, partyRoles } from "@repo/db-elise";
import { openTestDb, seedTenant, type TestDb } from "#/__tests__/test-db";
import { getMeEffect } from "#/modules/me/queries";
import { twoFactorStatusEffect } from "#/modules/two-factor";

let test: TestDb;
let tenantId: string;
let otherTenantId: string;

const grant = async (partyId: string, role: string, accountId: string) => {
  const found = await findTenantRole(test.raw, accountId, role);
  if (!found) throw new Error(`${role} role missing`);
  await test.raw.insert(partyRoles).values({ partyId, tenantId: accountId, roleId: found.id, roleScope: "tenant" });
};

const seedLogin = async (id: string, roles: { role: string; accountId: string }[], twoFactorEnabled: boolean) => {
  const { partyId } = await seedTenant(test, `person-${id}`);
  await test.raw.insert(authUser).values({ id, name: id, email: `${id}@example.com`, partyId, twoFactorEnabled });
  for (const { role, accountId } of roles) await grant(partyId, role, accountId);
};

beforeAll(async () => {
  test = await openTestDb();
  tenantId = (await seedTenant(test, "acme")).tenantId;
  otherTenantId = (await seedTenant(test, "globex")).tenantId;
  await ensureTenantRoles(test.raw, tenantId);
  await ensureTenantRoles(test.raw, otherTenantId);
  await seedLogin("owner-plain", [{ role: "tenant_admin", accountId: tenantId }], false);
  await seedLogin("owner-enrolled", [{ role: "tenant_admin", accountId: tenantId }], true);
  await seedLogin("workspace-plain", [{ role: "workspace_admin", accountId: tenantId }], false);
  await seedLogin("member-plain", [{ role: "workspace_member", accountId: tenantId }], false);
  await seedLogin("watcher-plain", [{ role: "workspace_watcher", accountId: tenantId }], false);
  await seedLogin(
    "admin-elsewhere",
    [
      { role: "workspace_member", accountId: tenantId },
      { role: "workspace_admin", accountId: otherTenantId },
    ],
    false,
  );
  await seedLogin("promoted", [{ role: "workspace_member", accountId: tenantId }], false);
});

afterAll(async () => {
  await test.close();
});

const statusOf = (userId: string) => Effect.runPromise(twoFactorStatusEffect(test.http, userId));

describe("twoFactorStatusEffect", () => {
  it.each([
    ["owner-plain", { enabled: false, setupRequired: true }],
    ["owner-enrolled", { enabled: true, setupRequired: false }],
    ["workspace-plain", { enabled: false, setupRequired: true }],
    ["member-plain", { enabled: false, setupRequired: false }],
    ["watcher-plain", { enabled: false, setupRequired: false }],
    ["admin-elsewhere", { enabled: false, setupRequired: true }],
  ])("%s", async (userId, expected) => {
    expect(await statusOf(userId)).toEqual(expected);
  });

  it("requires setup of a member the moment a Role makes them an admin", async () => {
    expect((await statusOf("promoted")).setupRequired).toBe(false);
    const [login] = await test.raw.select({ partyId: authUser.partyId }).from(authUser).where(eq(authUser.id, "promoted"));
    const role = await findTenantRole(test.raw, tenantId, "workspace_admin");
    if (!role) throw new Error("workspace_admin role missing");
    await test.raw.update(partyRoles).set({ roleId: role.id }).where(eq(partyRoles.partyId, login.partyId));

    expect((await statusOf("promoted")).setupRequired).toBe(true);
  });
});

describe("GET /me fields", () => {
  it("reports whether the Login has Two-factor and whether setup is required", async () => {
    const me = await Effect.runPromise(getMeEffect(test.http, "owner-plain"));

    expect(me).toMatchObject({ twoFactorEnabled: false, twoFactorSetupRequired: true });
  });
});
