import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { accessAuditLog, platformMasterPlans, scanFindingComments, scanFindings, scans, tenantCreditLedger, tenants, tenantSubscriptions } from "@repo/db-elise/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { OWNER_CONNECTION_USES } from "#/__tests__/owner-connection-uses";
import { openTestDb, scanValues, seedRepo, seedTenant, type TestDb } from "#/__tests__/test-db";
import { CROSS_ACCOUNT_CASES, NOT_TENANT_ROUTES, OTHER_COMMENT_ID, type CrossAccountCase } from "#/__tests__/tenant-route-cases";
import { callAs, tenantRouteApp } from "#/__tests__/tenant-route-harness";

const EnvelopeSchema = z.object({ data: z.union([z.array(z.unknown()), z.record(z.string(), z.unknown())]).nullable() });

let test: TestDb;
let tenantId: string;

const app = tenantRouteApp(() => test, { sessionUserId: async () => "guard-test-user" });

const mountedRoutes = [...new Set(app.routes.filter((route) => route.method !== "ALL").map((route) => `${route.method} ${route.path}`))];
const tenantRoutes = mountedRoutes.filter((route) => !NOT_TENANT_ROUTES.includes(route));
const caseEntries = Object.entries<CrossAccountCase>(CROSS_ACCOUNT_CASES);
const runCases = caseEntries.flatMap(([route, found]) => (found.kind === "run" ? [{ route, ...found }] : []));
type RunCase = (typeof runCases)[number];
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

// -----
// The other Account's money: a Plan, credit, a budget of its own
// with the change that set it, and a scan's spend this month. The
// usage routes must answer the caller with none of it.
// -----
const seedOtherUsage = async (otherTenantId: string, otherRepoId: string) => {
  const [pro] = await test.raw.select().from(platformMasterPlans).where(eq(platformMasterPlans.key, "pro"));
  await test.raw.insert(tenantSubscriptions).values({ tenantId: otherTenantId, planId: pro.id, status: "active", source: "grant" });
  await test.raw.insert(tenantCreditLedger).values({ tenantId: otherTenantId, kind: "topup", amountUsd: "40.0000", idempotencyKey: "theirs-topup" });
  await test.raw.update(tenants).set({ monthlyScanBudgetUsd: "99.00" }).where(eq(tenants.id, otherTenantId));
  await test.raw.insert(accessAuditLog).values({ action: "usage.budget.updated", subjectId: otherTenantId, before: { monthlyBudgetUsd: null }, after: { tenantId: otherTenantId, monthlyBudgetUsd: 99 } });
  await test.raw.insert(scans).values(scanValues(otherTenantId, otherRepoId, "theirs-spent", new Date().toISOString(), { costUsd: "3.0000", keySource: "platform" }));
};

const outcomeOf = (found: RunCase, status: number, data: z.infer<typeof EnvelopeSchema>["data"]) => {
  const fields = Array.isArray(data) ? {} : (data ?? {});
  if (found.expect === "own") return { got: [status, Object.fromEntries(Object.keys(found.own).map((key) => [key, fields[key]]))], want: [200, found.own] };
  const listed = (Array.isArray(data) ? data : Object.values(fields).filter(Array.isArray).flat()).length;
  return { got: [status, listed], want: [found.expect === "not-found" ? 404 : 200, 0] };
};

beforeAll(async () => {
  test = await openTestDb();
  tenantId = (await seedTenant(test, "acme")).tenantId;
  const otherTenantId = (await seedTenant(test, "other")).tenantId;
  await seedRepo(test, tenantId);
  const otherRepoId = await seedRepo(test, otherTenantId);
  await test.raw.insert(scans).values(scanValues(otherTenantId, otherRepoId, "theirs", "2026-11-01T00:00:00Z"));
  await test.raw.insert(scanFindings).values({ tenantId: otherTenantId, scanId: "theirs", findingId: "F-THEIRS", fingerprint: "b".repeat(64), status: "confirmed", severity: "high", title: "theirs", class: "authz" });
  await test.raw.insert(scanFindingComments).values({ tenantId: otherTenantId, repoId: otherRepoId, fingerprint: "b".repeat(64), body: "theirs" });
  await test.raw.insert(scanFindingComments).values({ id: OTHER_COMMENT_ID, tenantId: otherTenantId, repoId: otherRepoId, fingerprint: "b".repeat(64), body: "theirs, to delete or edit" });
  await seedOtherUsage(otherTenantId, otherRepoId);
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

  it.each(runCases)("$route answers one Account with nothing of another's", async (found) => {
    const res = await callAs(app, tenantId, found.path, { method: found.method, body: found.body });
    const { got, want } = outcomeOf(found, res.status, EnvelopeSchema.parse(await res.json()).data);
    expect(got).toEqual(want);
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
