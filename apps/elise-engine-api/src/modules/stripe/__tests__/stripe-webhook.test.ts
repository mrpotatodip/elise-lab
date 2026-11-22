import { platformMasterPlans, tenantSubscriptions } from "@repo/db-elise/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { fakeBindings, testExecutionContext } from "#/__tests__/fake-bindings";
import { fakeStripe } from "#/__tests__/fake-stripe";
import { tenantRouteApp } from "#/__tests__/tenant-route-harness";
import { openTestDb, seedTenant, type TestDb } from "#/__tests__/test-db";

const SECRET = "whsec_test_secret";
const PRICE = "price_runner_test";
const YEARLY_PRICE = "price_runner_year_test";
const hex = (bytes: ArrayBuffer) => [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, "0")).join("");

const signed = async (body: string, secret = SECRET) => {
  const timestamp = Math.floor(Date.now() / 1000);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${body}`)));
  return `t=${timestamp},v1=${signature}`;
};

let test: TestDb;
let accountId: string;
const stripe = fakeStripe();
const app = tenantRouteApp(() => test, { stripe: () => stripe.gateway });

type WebhookEvent = { id: string; type: string; data: { object: Record<string, string> } };

const post = async (event: WebhookEvent, header?: string) => {
  const body = JSON.stringify(event);
  const { env } = fakeBindings({ STRIPE_WEBHOOK_SECRET: SECRET });
  const headers = new Headers({ "content-type": "application/json", "stripe-signature": header ?? (await signed(body)) });
  return app.fetch(new Request("http://localhost/stripe/webhook", { method: "POST", headers, body }), env, testExecutionContext);
};

const subscriptionEvent = (type: string, id = "sub_1") => ({ id: "evt_1", type, data: { object: { id } } });
const rowOf = async () => (await test.raw.select().from(tenantSubscriptions).where(eq(tenantSubscriptions.tenantId, accountId)))[0];

beforeAll(async () => {
  test = await openTestDb();
  accountId = (await seedTenant(test, "acme")).tenantId;
  await test.raw.update(platformMasterPlans).set({ stripePriceId: PRICE, stripeYearlyPriceId: YEARLY_PRICE }).where(eq(platformMasterPlans.key, "runner"));
});

afterAll(async () => {
  await test.close();
});

beforeEach(async () => {
  stripe.subscriptions.clear();
  await test.raw.delete(tenantSubscriptions);
});

describe("POST /stripe/webhook: the signature is the only credential", () => {
  it.each([
    ["a signature made with another secret", async (body: string) => signed(body, "whsec_other")],
    ["no signature header", async () => ""],
    ["a header that is not a signature", async () => "garbage"],
  ])("refuses %s and writes nothing", async (_name, makeHeader) => {
    stripe.subscriptions.set("sub_1", { id: "sub_1", customerId: "cus_1", status: "active", priceId: PRICE, currentPeriodEnd: null, cancelAtPeriodEnd: false, accountId });
    const event = subscriptionEvent("customer.subscription.created");
    const response = await post(event, await makeHeader(JSON.stringify(event)));
    expect([response.status, await rowOf()]).toEqual([400, undefined]);
  });
});

describe("POST /stripe/webhook: Stripe's status becomes the Account's Subscription", () => {
  const periodEnd = new Date("2030-01-15T00:00:00.000Z");
  it.each([
    ["active", "active"],
    ["trialing", "active"],
    ["past_due", "past_due"],
    ["unpaid", "unpaid"],
    ["incomplete", "incomplete"],
    ["canceled", "canceled"],
    ["incomplete_expired", "canceled"],
  ])("Stripe %s is stored as %s", async (stripeStatus, expected) => {
    stripe.subscriptions.set("sub_1", { id: "sub_1", customerId: "cus_1", status: stripeStatus, priceId: PRICE, currentPeriodEnd: periodEnd, cancelAtPeriodEnd: true, accountId });
    const response = await post(subscriptionEvent("customer.subscription.updated"));
    const row = await rowOf();
    expect([response.status, row.status, row.source, row.stripeCustomerId, row.stripeSubscriptionId, row.currentPeriodEnd?.toISOString(), row.cancelAtPeriodEnd]).toEqual([
      200,
      expected,
      "stripe",
      "cus_1",
      "sub_1",
      periodEnd.toISOString(),
      true,
    ]);
  });

  it.each([
    ["the monthly price", PRICE, "month"],
    ["the yearly price", YEARLY_PRICE, "year"],
  ])("sets the interval from %s", async (_name, priceId, expected) => {
    stripe.subscriptions.set("sub_1", { id: "sub_1", customerId: "cus_1", status: "active", priceId, currentPeriodEnd: null, cancelAtPeriodEnd: false, accountId });
    await post(subscriptionEvent("customer.subscription.updated"));
    const row = await rowOf();
    const [runner] = await test.raw.select().from(platformMasterPlans).where(eq(platformMasterPlans.key, "runner"));
    expect([row.billingInterval, row.planId]).toEqual([expected, runner.id]);
  });

  it("follows a switch from monthly to yearly on the same subscription", async () => {
    stripe.subscriptions.set("sub_1", { id: "sub_1", customerId: "cus_1", status: "active", priceId: PRICE, currentPeriodEnd: null, cancelAtPeriodEnd: false, accountId });
    await post(subscriptionEvent("customer.subscription.created"));
    stripe.subscriptions.set("sub_1", { id: "sub_1", customerId: "cus_1", status: "active", priceId: YEARLY_PRICE, currentPeriodEnd: null, cancelAtPeriodEnd: false, accountId });
    await post(subscriptionEvent("customer.subscription.updated"));
    expect((await rowOf()).billingInterval).toBe("year");
  });

  it("sets past_due_since on the first past_due, keeps it on the next and clears it on active", async () => {
    stripe.subscriptions.set("sub_1", { id: "sub_1", customerId: "cus_1", status: "past_due", priceId: PRICE, currentPeriodEnd: null, cancelAtPeriodEnd: false, accountId });
    await post({ id: "evt_4", type: "invoice.payment_failed", data: { object: { subscription: "sub_1", customer: "cus_1" } } });
    const first = (await rowOf()).pastDueSince;
    await post(subscriptionEvent("customer.subscription.updated"));
    const second = (await rowOf()).pastDueSince;
    stripe.subscriptions.set("sub_1", { id: "sub_1", customerId: "cus_1", status: "active", priceId: PRICE, currentPeriodEnd: null, cancelAtPeriodEnd: false, accountId });
    await post(subscriptionEvent("customer.subscription.updated"));
    expect([first instanceof Date, second?.getTime() === first?.getTime(), (await rowOf()).pastDueSince]).toEqual([true, true, null]);
  });

  it("replaces an operator grant on the same plan", async () => {
    const [runner] = await test.raw.select().from(platformMasterPlans).where(eq(platformMasterPlans.key, "runner"));
    await test.raw.insert(tenantSubscriptions).values({ tenantId: accountId, planId: runner.id, status: "active", source: "grant" });
    stripe.subscriptions.set("sub_1", { id: "sub_1", customerId: "cus_1", status: "active", priceId: PRICE, currentPeriodEnd: null, cancelAtPeriodEnd: false, accountId });
    await post({ id: "evt_2", type: "checkout.session.completed", data: { object: { subscription: "sub_1", client_reference_id: accountId, customer: "cus_1" } } });
    const row = await rowOf();
    expect([row.source, row.stripeSubscriptionId]).toEqual(["stripe", "sub_1"]);
  });

  it("finds the Account by its Stripe customer when the subscription has no metadata", async () => {
    const [runner] = await test.raw.select().from(platformMasterPlans).where(eq(platformMasterPlans.key, "runner"));
    await test.raw.insert(tenantSubscriptions).values({ tenantId: accountId, planId: runner.id, status: "canceled", source: "stripe", stripeCustomerId: "cus_1", stripeSubscriptionId: "sub_old" });
    stripe.subscriptions.set("sub_2", { id: "sub_2", customerId: "cus_1", status: "active", priceId: PRICE, currentPeriodEnd: null, cancelAtPeriodEnd: false, accountId: null });
    await post(subscriptionEvent("customer.subscription.created", "sub_2"));
    const row = await rowOf();
    expect([row.status, row.stripeSubscriptionId]).toEqual(["active", "sub_2"]);
  });

  it("keeps a live subscription when an event arrives for another Stripe subscription, whatever its status", async () => {
    const [runner] = await test.raw.select().from(platformMasterPlans).where(eq(platformMasterPlans.key, "runner"));
    await test.raw.insert(tenantSubscriptions).values({ tenantId: accountId, planId: runner.id, status: "active", source: "stripe", stripeCustomerId: "cus_1", stripeSubscriptionId: "sub_live" });
    stripe.subscriptions.set("sub_old", { id: "sub_old", customerId: "cus_1", status: "canceled", priceId: PRICE, currentPeriodEnd: null, cancelAtPeriodEnd: false, accountId });
    stripe.subscriptions.set("sub_new", { id: "sub_new", customerId: "cus_1", status: "active", priceId: PRICE, currentPeriodEnd: null, cancelAtPeriodEnd: false, accountId });
    await post(subscriptionEvent("customer.subscription.deleted", "sub_old"));
    await post(subscriptionEvent("customer.subscription.created", "sub_new"));
    const row = await rowOf();
    expect([row.status, row.stripeSubscriptionId]).toEqual(["active", "sub_live"]);
  });

  it("answers 400 for a signed body that is not JSON", async () => {
    const { env } = fakeBindings({ STRIPE_WEBHOOK_SECRET: SECRET });
    const body = "{not json";
    const headers = new Headers({ "stripe-signature": await signed(body) });
    const response = await app.fetch(new Request("http://localhost/stripe/webhook", { method: "POST", headers, body }), env, testExecutionContext);
    expect(response.status).toBe(400);
  });

  it("answers 200 and writes nothing for an event it does not handle", async () => {
    const response = await post({ id: "evt_3", type: "charge.succeeded", data: { object: { id: "ch_1" } } });
    expect([response.status, await rowOf()]).toEqual([200, undefined]);
  });
});
