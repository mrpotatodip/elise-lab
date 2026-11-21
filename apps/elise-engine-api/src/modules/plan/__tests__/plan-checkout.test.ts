import { ensureTenantRoles, findTenantRole } from "@repo/db-elise";
import { authUser, partyRoles, platformMasterPlans, tenantSubscriptions, tenantTeamInvites } from "@repo/db-elise/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { AccessPower } from "@repo/contracts/elise";
import { fakeStripe } from "#/__tests__/fake-stripe";
import { callAs, tenantRouteApp } from "#/__tests__/tenant-route-harness";
import { openTestDb, seedTenant, type TestDb } from "#/__tests__/test-db";

const PRICE = "price_runner_test";
const YEARLY_PRICE = "price_runner_year_test";
const USER = "checkout-admin";
const DASHBOARD = "https://dashboard.example.test";
const UrlBodySchema = z.object({ data: z.object({ url: z.string() }).nullable() });

let test: TestDb;
let accountId: string;
let runnerPlanId: string;
let roleId: string;
let partyIds: string[] = [];
let powers: AccessPower[] = ["company:plan:manage"];
const stripe = fakeStripe();
const app = tenantRouteApp(() => test, {
  stripe: () => stripe.gateway,
  sessionUserId: async () => USER,
  userHasPower: async (_c, _userId, _accountId, power) => powers.includes(power),
});

const rowOf = async () => (await test.raw.select().from(tenantSubscriptions).where(eq(tenantSubscriptions.tenantId, accountId)))[0];
const call = (path: string) => callAs(app, accountId, path, { method: "POST", env: { DASHBOARD_URL: DASHBOARD } });
const answer = async (path: string) => {
  const response = await call(path);
  return { status: response.status, body: UrlBodySchema.parse(await response.json()) };
};

const setPeople = async (count: number) => {
  await test.raw.insert(partyRoles).values(partyIds.slice(0, count).map((partyId) => ({ partyId, tenantId: accountId, roleId, roleScope: "tenant" as const })));
};
const addInvite = async () => {
  await test.raw.insert(tenantTeamInvites).values({
    tenantId: accountId,
    email: "invited@example.com",
    roleId,
    tokenHash: "hash-0",
    invitedBy: partyIds[0],
    expiresAt: new Date(Date.now() + 86_400_000),
  });
};

beforeAll(async () => {
  test = await openTestDb();
  const acme = await seedTenant(test, "acme");
  accountId = acme.tenantId;
  partyIds = [acme.partyId];
  for (const slug of ["second", "third"]) partyIds.push((await seedTenant(test, slug)).partyId);
  await ensureTenantRoles(test.raw, accountId);
  const role = await findTenantRole(test.raw, accountId, "workspace_member");
  if (!role) throw new Error("workspace_member role missing");
  roleId = role.id;
  await test.raw.insert(authUser).values({ id: USER, name: "Admin", email: "admin@example.com", emailVerified: true, partyId: acme.partyId });
  await test.raw.update(platformMasterPlans).set({ stripePriceId: PRICE, stripeYearlyPriceId: YEARLY_PRICE }).where(eq(platformMasterPlans.key, "runner"));
  [{ id: runnerPlanId }] = await test.raw.select({ id: platformMasterPlans.id }).from(platformMasterPlans).where(eq(platformMasterPlans.key, "runner"));
});

afterAll(async () => {
  await test.close();
});

beforeEach(async () => {
  powers = ["company:plan:manage"];
  stripe.customers.length = 0;
  stripe.checkouts.length = 0;
  stripe.portals.length = 0;
  await test.raw.delete(tenantSubscriptions);
  await test.raw.delete(tenantTeamInvites);
  await test.raw.delete(partyRoles).where(eq(partyRoles.tenantId, accountId));
});

describe("POST /usage/plan/checkout", () => {
  it("starts a Stripe checkout for the Runner plan with the Account's ID and the dashboard return URLs", async () => {
    const { status, body } = await answer("/usage/plan/checkout");
    expect([status, body.data?.url, stripe.checkouts]).toEqual([
      200,
      `https://checkout.stripe.test/${stripe.customers[0].id}`,
      [{ customerId: stripe.customers[0].id, accountId, priceId: PRICE, successUrl: `${DASHBOARD}/settings/plan?checkout=success`, cancelUrl: `${DASHBOARD}/settings/plan?checkout=cancelled` }],
    ]);
    expect(stripe.customers).toMatchObject([{ name: "acme", email: "admin@example.com", accountId }]);
  });

  it.each([
    { name: "year", body: { planKey: "runner", interval: "year" }, priceId: YEARLY_PRICE },
    { name: "month", body: { planKey: "runner", interval: "month" }, priceId: PRICE },
    { name: "no interval (an old dashboard)", body: { planKey: "runner" }, priceId: PRICE },
  ])("checks out the price of the interval: $name", async ({ body, priceId }) => {
    const response = await callAs(app, accountId, "/usage/plan/checkout", { method: "POST", body, env: { DASHBOARD_URL: DASHBOARD } });
    expect([response.status, stripe.checkouts.map((checkout) => checkout.priceId)]).toEqual([200, [priceId]]);
  });

  it("refuses a yearly checkout for a plan with no yearly price and asks Stripe for nothing", async () => {
    await test.raw.update(platformMasterPlans).set({ stripePriceId: "price_starter_test", stripeYearlyPriceId: null, enabled: true }).where(eq(platformMasterPlans.key, "starter"));
    const response = await callAs(app, accountId, "/usage/plan/checkout", { method: "POST", body: { planKey: "starter", interval: "year" }, env: { DASHBOARD_URL: DASHBOARD } });
    expect([response.status, stripe.checkouts.length, stripe.customers.length]).toEqual([400, 0, 0]);
  });

  it("refuses an interval Stripe does not sell", async () => {
    const response = await callAs(app, accountId, "/usage/plan/checkout", { method: "POST", body: { planKey: "runner", interval: "week" }, env: { DASHBOARD_URL: DASHBOARD } });
    expect([response.status, stripe.checkouts.length]).toEqual([400, 0]);
  });

  it("starts a checkout on the Starter price for planKey starter", async () => {
    await test.raw.update(platformMasterPlans).set({ stripePriceId: "price_starter_test", enabled: true }).where(eq(platformMasterPlans.key, "starter"));
    const response = await callAs(app, accountId, "/usage/plan/checkout", { method: "POST", body: { planKey: "starter" }, env: { DASHBOARD_URL: DASHBOARD } });
    expect([response.status, stripe.checkouts.map((checkout) => checkout.priceId)]).toEqual([200, ["price_starter_test"]]);
  });

  it.each([
    { name: "an unknown plan", planKey: "nope", enabled: true, price: "price_x" },
    { name: "a disabled plan", planKey: "starter", enabled: false, price: "price_starter_test" },
    { name: "a plan with no price", planKey: "starter", enabled: true, price: null },
  ])("refuses $name and asks Stripe for nothing", async ({ planKey, enabled, price }) => {
    await test.raw.update(platformMasterPlans).set({ stripePriceId: price, enabled }).where(eq(platformMasterPlans.key, "starter"));
    const response = await callAs(app, accountId, "/usage/plan/checkout", { method: "POST", body: { planKey }, env: { DASHBOARD_URL: DASHBOARD } });
    expect([response.status, stripe.checkouts.length]).toEqual([400, 0]);
  });

  it.each([
    { name: "people at the cap", members: 2, invite: false, status: 200 },
    { name: "people over the cap", members: 3, invite: false, status: 409 },
    { name: "people plus a pending invite over the cap", members: 2, invite: true, status: 409 },
  ])("for Starter with $name answers $status and opens a session only when allowed", async ({ members, invite, status }) => {
    await test.raw.update(platformMasterPlans).set({ stripePriceId: "price_starter_test", enabled: true }).where(eq(platformMasterPlans.key, "starter"));
    await setPeople(members);
    if (invite) await addInvite();
    const response = await callAs(app, accountId, "/usage/plan/checkout", { method: "POST", body: { planKey: "starter" }, env: { DASHBOARD_URL: DASHBOARD } });
    expect([response.status, stripe.checkouts.length, stripe.customers.length]).toEqual([status, status === 200 ? 1 : 0, status === 200 ? 1 : 0]);
  });

  it("refuses a login whose Role lacks company:plan:manage and asks Stripe for nothing", async () => {
    powers = ["company:plan:read"];
    const { status } = await answer("/usage/plan/checkout");
    expect([status, stripe.customers.length, stripe.checkouts.length]).toEqual([403, 0, 0]);
  });

  it.each(["active", "past_due"] as const)("refuses while a Stripe Subscription is %s", async (status) => {
    await test.raw.insert(tenantSubscriptions).values({ tenantId: accountId, planId: runnerPlanId, status, source: "stripe", stripeCustomerId: "cus_1", stripeSubscriptionId: "sub_1" });
    const response = await answer("/usage/plan/checkout");
    expect([response.status, stripe.checkouts.length]).toEqual([409, 0]);
  });

  it("lets an Account on an operator grant subscribe, and leaves the grant until the webhook says so", async () => {
    await test.raw.insert(tenantSubscriptions).values({ tenantId: accountId, planId: runnerPlanId, status: "active", source: "grant" });
    const response = await answer("/usage/plan/checkout");
    expect([response.status, (await rowOf()).source]).toEqual([200, "grant"]);
  });

  it("creates one Stripe customer however many times the Account clicks Subscribe", async () => {
    await answer("/usage/plan/checkout");
    await answer("/usage/plan/checkout");
    expect([stripe.customers.length, stripe.checkouts[1].customerId]).toEqual([1, stripe.customers[0].id]);
  });

  it("reuses the Stripe customer of an Account that cancelled", async () => {
    await test.raw.insert(tenantSubscriptions).values({ tenantId: accountId, planId: runnerPlanId, status: "canceled", source: "stripe", stripeCustomerId: "cus_old", stripeSubscriptionId: "sub_old" });
    await answer("/usage/plan/checkout");
    expect([stripe.customers.length, stripe.checkouts[0].customerId]).toEqual([0, "cus_old"]);
  });
});

describe("POST /usage/plan/portal", () => {
  it("opens the Billing portal for the Account's Stripe customer", async () => {
    await test.raw.insert(tenantSubscriptions).values({ tenantId: accountId, planId: runnerPlanId, status: "active", source: "stripe", stripeCustomerId: "cus_1", stripeSubscriptionId: "sub_1" });
    const { status, body } = await answer("/usage/plan/portal");
    expect([status, body.data?.url, stripe.portals]).toEqual([200, "https://billing.stripe.test/cus_1", [{ customerId: "cus_1", returnUrl: `${DASHBOARD}/settings/plan` }]]);
  });

  it("refuses a login without company:plan:manage", async () => {
    powers = ["company:plan:read"];
    const { status } = await answer("/usage/plan/portal");
    expect([status, stripe.portals.length]).toEqual([403, 0]);
  });

  it("answers 404 for an Account that has never paid", async () => {
    const { status } = await answer("/usage/plan/portal");
    expect(status).toBe(404);
  });
});
