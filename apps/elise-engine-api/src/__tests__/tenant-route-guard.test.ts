import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { ensureTenantRoles, findTenantRole } from "@repo/db-elise";
import {
  authUser,
  parties,
  partyMasterTypes,
  partyPersons,
  partyRoles,
  scanFindingComments,
  scanFindings,
  scans,
  tenantGroupMembers,
  tenantGroups,
  tenantTeamInviteGroups,
  tenantTeamInvites,
} from "@repo/db-elise/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { OWNER_CONNECTION_USES } from "#/__tests__/owner-connection-uses";
import { openTestDb, scanValues, seedRepo, seedTenant, type TestDb } from "#/__tests__/test-db";
import {
  CROSS_ACCOUNT_CASES,
  NOT_TENANT_ROUTES,
  OTHER_COMMENT_ID,
  OTHER_GROUP_ID,
  OTHER_GROUP_NAME,
  OTHER_INVITE_ID,
  OTHER_PARTY_ID,
  type CrossAccountCase,
} from "#/__tests__/tenant-route-cases";
import { callAs, tenantRouteApp } from "#/__tests__/tenant-route-harness";

const EnvelopeSchema = z.object({ data: z.union([z.array(z.unknown()), z.record(z.string(), z.unknown())]).nullable() });
const STATUS_OF = { "not-found": 404, empty: 200, refused: 400, created: 201 } as const;

let test: TestDb;
let tenantId: string;

const app = tenantRouteApp(() => test, { sessionUserId: async () => "guard-test-user" });

const mountedRoutes = [...new Set(app.routes.filter((route) => route.method !== "ALL").map((route) => `${route.method} ${route.path}`))];
const tenantRoutes = mountedRoutes.filter((route) => !NOT_TENANT_ROUTES.includes(route));
const caseEntries = Object.entries<CrossAccountCase>(CROSS_ACCOUNT_CASES);
const runCases = caseEntries.flatMap(([route, found]) => (found.kind === "run" ? [{ route, ...found }] : []));
const allowedOwnerUses = new Map<string, number>(Object.entries(OWNER_CONNECTION_USES));
const SRC = resolve(__dirname, "..");
const OWNER_USE = /\b(dbConnect|poolConnect|withPool)\(|\bDATABASE_URL\b/g;

const ownerUsesBySourceFile = () =>
  Object.fromEntries(
    readdirSync(SRC, { recursive: true, encoding: "utf8" })
      .filter((file) => file.endsWith(".ts") && !file.endsWith(".d.ts") && !file.includes("__tests__"))
      .map((file) => [file.split("\\").join("/"), (readFileSync(join(SRC, file), "utf8").match(OWNER_USE) ?? []).length] as const)
      .filter(([, uses]) => uses > 0),
  );

beforeAll(async () => {
  test = await openTestDb();
  const caller = await seedTenant(test, "acme");
  tenantId = caller.tenantId;
  const callerPartyId = caller.partyId;
  const otherTenantId = (await seedTenant(test, "other")).tenantId;
  await seedRepo(test, tenantId);
  const otherRepoId = await seedRepo(test, otherTenantId);
  await test.raw.insert(scans).values(scanValues(otherTenantId, otherRepoId, "theirs", "2026-11-01T00:00:00Z"));
  await test.raw.insert(scanFindings).values({ tenantId: otherTenantId, scanId: "theirs", findingId: "F-THEIRS", fingerprint: "b".repeat(64), status: "confirmed", severity: "high", title: "theirs", class: "authz" });
  await test.raw.insert(scanFindingComments).values({ tenantId: otherTenantId, repoId: otherRepoId, fingerprint: "b".repeat(64), body: "theirs" });
  await test.raw.insert(scanFindingComments).values({ id: OTHER_COMMENT_ID, tenantId: otherTenantId, repoId: otherRepoId, fingerprint: "b".repeat(64), body: "theirs, to delete or edit" });
  await test.raw.insert(authUser).values({ id: "guard-test-user", name: "Ada Rossi", email: "guard@example.com", partyId: callerPartyId });
  await ensureTenantRoles(test.raw, otherTenantId);
  const otherRole = await findTenantRole(test.raw, otherTenantId, "workspace_member");
  if (!otherRole) throw new Error("workspace_member role missing");
  const [personType] = await test.raw.select().from(partyMasterTypes).where(eq(partyMasterTypes.key, "person"));
  await test.raw.insert(parties).values({ id: OTHER_PARTY_ID, masterTypeId: personType.id });
  await test.raw.insert(partyPersons).values({ partyId: OTHER_PARTY_ID, firstName: "Bo", lastName: "Chen" });
  await test.raw.insert(partyRoles).values({ partyId: OTHER_PARTY_ID, tenantId: otherTenantId, roleId: otherRole.id, roleScope: "tenant" });
  await test.raw.insert(tenantGroups).values({ id: OTHER_GROUP_ID, tenantId: otherTenantId, name: OTHER_GROUP_NAME });
  await test.raw.insert(tenantGroupMembers).values({ groupId: OTHER_GROUP_ID, tenantId: otherTenantId, partyId: OTHER_PARTY_ID });
  await test.raw.insert(tenantTeamInvites).values({ id: OTHER_INVITE_ID, tenantId: otherTenantId, email: "theirs@example.com", roleId: otherRole.id, tokenHash: "theirs", invitedBy: OTHER_PARTY_ID, expiresAt: new Date("2099-01-01T00:00:00Z") });
  await test.raw.insert(tenantTeamInviteGroups).values({ inviteId: OTHER_INVITE_ID, groupId: OTHER_GROUP_ID, tenantId: otherTenantId });
});

afterAll(async () => {
  await test.close();
});

describe("every tenant route has a cross-account case", () => {
  it("lists a case for each route the app mounts", () => {
    expect(tenantRoutes.filter((route) => !(route in CROSS_ACCOUNT_CASES))).toEqual([]);
  });

  it("lists no case for a route the app no longer mounts", () => {
    expect(Object.keys(CROSS_ACCOUNT_CASES).filter((route) => !tenantRoutes.includes(route))).toEqual([]);
  });

  it("lists no route as not-tenant that the app no longer mounts", () => {
    expect(NOT_TENANT_ROUTES.filter((route) => !mountedRoutes.includes(route))).toEqual([]);
  });

  it.each(runCases)("$route answers one Account with nothing of another's", async ({ path, method, body, expect: outcome }) => {
    const res = await callAs(app, tenantId, path, { method, body });
    const { data } = EnvelopeSchema.parse(await res.json());
    const lists = Array.isArray(data) ? [data] : Object.values(data ?? {}).filter(Array.isArray);
    expect([res.status, lists.flat().length]).toEqual([STATUS_OF[outcome], 0]);
  });
});

describe("the owner connection stays inside its list", () => {
  it("opens it from no file outside the list, and no more often than listed", () => {
    const used = ownerUsesBySourceFile();
    expect(Object.entries(used).filter(([file, uses]) => uses > (allowedOwnerUses.get(file) ?? 0))).toEqual([]);
  });

  it("lists no file that stopped using it", () => {
    const used = ownerUsesBySourceFile();
    expect([...allowedOwnerUses.keys()].filter((file) => !(file in used))).toEqual([]);
  });
});
