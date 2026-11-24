import { and, eq } from "drizzle-orm";
import { Effect } from "effect";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  accessAuditLog,
  authSession,
  authTwoFactor,
  authUser,
  ensureTenantRoles,
  findTenantRole,
  parties,
  partyMasterTypes,
  partyPersons,
  partyRoles,
} from "@repo/db-elise";
import { openTestDb, seedTenant, type TestDb } from "#/__tests__/test-db";
import { resetTwoFactorEffect } from "#/modules/team/queries";

let test: TestDb;
let tenantId: string;
let otherTenantId: string;

const run = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(effect);
const fail = <A, E>(effect: Effect.Effect<A, E>) => Effect.runPromise(Effect.flip(effect));

type Person = { userId: string; partyId: string };

const addPerson = async (id: string, tenant: string, roleKey: string, twoFactor: boolean): Promise<Person> => {
  const role = await findTenantRole(test.raw, tenant, roleKey);
  if (!role) throw new Error(`${roleKey} role missing`);
  const [personType] = await test.raw.select().from(partyMasterTypes).where(eq(partyMasterTypes.key, "person"));
  const [party] = await test.raw.insert(parties).values({ masterTypeId: personType.id }).returning();
  await test.raw.insert(partyPersons).values({ partyId: party.id, firstName: id, lastName: "Test" });
  await test.raw.insert(authUser).values({
    id,
    name: id,
    email: `${id}@example.com`,
    emailVerified: true,
    partyId: party.id,
    twoFactorEnabled: twoFactor,
  });
  await test.raw
    .insert(partyRoles)
    .values({ partyId: party.id, tenantId: tenant, roleId: role.id, roleScope: "tenant" });
  if (twoFactor)
    await test.raw
      .insert(authTwoFactor)
      .values({ id: `tf-${id}`, userId: id, secret: "sealed", backupCodes: "sealed" });
  await test.raw
    .insert(authSession)
    .values({ id: `s1-${id}`, userId: id, token: `t1-${id}`, expiresAt: new Date("2099-01-01T00:00:00Z") });
  await test.raw
    .insert(authSession)
    .values({ id: `s2-${id}`, userId: id, token: `t2-${id}`, expiresAt: new Date("2099-01-01T00:00:00Z") });
  return { userId: id, partyId: party.id };
};

let owner: Person;
let coOwner: Person;
let wsAdmin: Person;
let member: Person;

beforeAll(async () => {
  test = await openTestDb();
  ({ tenantId } = await seedTenant(test, "acme"));
  ({ tenantId: otherTenantId } = await seedTenant(test, "other"));
  await ensureTenantRoles(test.raw, tenantId);
  await ensureTenantRoles(test.raw, otherTenantId);
  owner = await addPerson("owner", tenantId, "tenant_admin", true);
  coOwner = await addPerson("co-owner", tenantId, "tenant_admin", true);
  wsAdmin = await addPerson("ws-admin", tenantId, "workspace_admin", true);
  member = await addPerson("member", tenantId, "workspace_member", true);
});

afterAll(async () => {
  await test.close();
});

const stateOf = async (person: Person) => {
  const [login] = await test.raw
    .select({ on: authUser.twoFactorEnabled })
    .from(authUser)
    .where(eq(authUser.id, person.userId));
  const secrets = await test.raw
    .select({ id: authTwoFactor.id })
    .from(authTwoFactor)
    .where(eq(authTwoFactor.userId, person.userId));
  const sessions = await test.raw
    .select({ id: authSession.id })
    .from(authSession)
    .where(eq(authSession.userId, person.userId));
  return { enabled: login.on, secrets: secrets.length, sessions: sessions.length };
};

describe("resetTwoFactorEffect", () => {
  it("lets a tenant_admin reset another admin: secret gone, flag off, every session gone, one audit row", async () => {
    const result = await run(resetTwoFactorEffect(test.pool, tenantId, owner.userId, coOwner.partyId));

    expect(result).toMatchObject({ partyId: coOwner.partyId, userId: coOwner.userId, email: "co-owner@example.com" });
    expect(await stateOf(coOwner)).toEqual({ enabled: false, secrets: 0, sessions: 0 });
    const audit = await test.raw
      .select({ actor: accessAuditLog.actorPartyId })
      .from(accessAuditLog)
      .where(and(eq(accessAuditLog.action, "team.two_factor.reset"), eq(accessAuditLog.subjectId, coOwner.partyId)));
    expect(audit).toEqual([{ actor: owner.partyId }]);
  });

  it("lets a workspace_admin reset a non-admin", async () => {
    await run(resetTwoFactorEffect(test.pool, tenantId, wsAdmin.userId, member.partyId));

    expect(await stateOf(member)).toEqual({ enabled: false, secrets: 0, sessions: 0 });
  });

  it("refuses a workspace_admin on a tenant_admin and on another workspace_admin, and changes nothing", async () => {
    const peer = await addPerson("ws-peer", tenantId, "workspace_admin", true);

    expect(await fail(resetTwoFactorEffect(test.pool, tenantId, wsAdmin.userId, owner.partyId))).toMatchObject({
      _tag: "Forbidden",
    });
    expect(await fail(resetTwoFactorEffect(test.pool, tenantId, wsAdmin.userId, peer.partyId))).toMatchObject({
      _tag: "Forbidden",
    });
    expect(await stateOf(owner)).toEqual({ enabled: true, secrets: 1, sessions: 2 });
    expect(await stateOf(peer)).toEqual({ enabled: true, secrets: 1, sessions: 2 });
  });

  it("refuses anyone resetting their own Two-factor", async () => {
    expect(await fail(resetTwoFactorEffect(test.pool, tenantId, owner.userId, owner.partyId))).toMatchObject({
      _tag: "Forbidden",
    });
    expect(await stateOf(owner)).toEqual({ enabled: true, secrets: 1, sessions: 2 });
  });

  it("answers NotFound for a member of another Account", async () => {
    const stranger = await addPerson("stranger", otherTenantId, "workspace_member", true);

    expect(await fail(resetTwoFactorEffect(test.pool, tenantId, owner.userId, stranger.partyId))).toMatchObject({
      _tag: "NotFound",
    });
    expect(await stateOf(stranger)).toEqual({ enabled: true, secrets: 1, sessions: 2 });
  });
});
