import { authUser, platformMasterPlans, tenantSubscriptions } from "@repo/db-elise/schema";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { AccessPower } from "@repo/contracts/elise";
import { fakeStripe } from "#/__tests__/fake-stripe";
import { callAs, tenantRouteApp } from "#/__tests__/tenant-route-harness";
import { openTestDb, seedTenant, type TestDb } from "#/__tests__/test-db";

const PRICE = "price_runner_test";
const USER = "checkout-admin";
const DASHBOARD = "https://dashboard.example.test";
const UrlBodySchema = z.object({ data: z.object({ url: z.string() }).nullable() });

let test: TestDb;
let accountId: string;
let runnerPlanId: string;
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

beforeAll(async () => {
  test = await openTestDb();
  const acme = await seedTenant(test, "acme");
  accountId = acme.tenantId;
  await test.raw.insert(authUser).values({ id: USER, name: "Admin", email: "admin@example.com", emailVerified: true, partyId: acme.partyId });
  await test.raw.update(platformMasterPlans).set({ stripePriceId: PRICE }).where(eq(platformMasterPlans.key, "runner"));
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
