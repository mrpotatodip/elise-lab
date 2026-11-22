import { eq } from "drizzle-orm";
import { Effect } from "effect";
import { authAccount, authUser, parties, partyRoles, tenants } from "@repo/db-elise/schema";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { openTestDb, type TestDb } from "#/__tests__/test-db";
import { insertAccountEffect, pickFreeSlugEffect } from "#/modules/sign-up/queries";
import type { NewAccount } from "#/modules/sign-up/types";

let test: TestDb;

const account = (overrides: Partial<NewAccount> = {}): NewAccount => ({
  firstName: "Ada",
  lastName: "Rossi",
  email: "ada@example.com",
  passwordHash: "hash",
  accountName: "Acme Labs",
  timezone: "UTC",
  slug: "acme-labs",
  ...overrides,
});

const count = async (table: typeof authUser | typeof tenants | typeof parties) => (await test.raw.select().from(table)).length;

beforeAll(async () => {
  test = await openTestDb();
});

afterAll(async () => {
  await test.close();
});

describe("insertAccountEffect", () => {
  it("creates the person, login, credential, tenant and admin role with no invite code", async () => {
    const result = await Effect.runPromise(insertAccountEffect(test.pool, account()));

    expect(result.tenant).toMatchObject({ name: "Acme Labs", slug: "acme-labs", timezone: "UTC", role: "tenant_admin" });
    const [login] = await test.raw.select().from(authUser).where(eq(authUser.id, result.userId));
    expect(login).toMatchObject({ email: "ada@example.com", name: "Ada Rossi", emailVerified: false });
    expect((await test.raw.select().from(authAccount).where(eq(authAccount.userId, result.userId)))[0]).toMatchObject({ providerId: "credential", password: "hash" });
    const [tenant] = await test.raw.select().from(tenants).where(eq(tenants.id, result.tenant.id));
    expect(tenant.partyId).toBe(login.partyId);
    expect(await test.raw.select().from(partyRoles).where(eq(partyRoles.partyId, login.partyId))).toHaveLength(1);
  });

  it("answers Conflict for a taken email and saves nothing", async () => {
    const before = { users: await count(authUser), tenants: await count(tenants), parties: await count(parties) };
    const error = await Effect.runPromise(Effect.flip(insertAccountEffect(test.pool, account({ slug: "another" }))));

    expect(error).toMatchObject({ _tag: "Conflict" });
    expect({ users: await count(authUser), tenants: await count(tenants), parties: await count(parties) }).toEqual(before);
  });

  it("tells a taken slug apart so the caller can pick another", async () => {
    const error = await Effect.runPromise(Effect.flip(insertAccountEffect(test.pool, account({ email: "slug@example.com" }))));

    expect(error._tag).toBe("SlugTaken");
  });
});

describe("pickFreeSlugEffect", () => {
  it("skips a slug a tenant already has", async () => {
    expect(await Effect.runPromise(pickFreeSlugEffect(test.pool, "Acme Labs"))).toBe("acme-labs-2");
  });

  it("takes the plain name when it is free", async () => {
    expect(await Effect.runPromise(pickFreeSlugEffect(test.pool, "Brand New Co"))).toBe("brand-new-co");
  });
});
