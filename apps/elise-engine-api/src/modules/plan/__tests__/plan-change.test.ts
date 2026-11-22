import { ensureTenantRoles, findTenantRole } from "@repo/db-elise";
import { authUser, partyRoles, platformMasterPlans, tenantSubscriptions, tenantTeamInvites } from "@repo/db-elise/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { AccessPower } from "@repo/contracts/elise";
import { fakeStripe } from "#/__tests__/fake-stripe";
import { callAs, tenantRouteApp } from "#/__tests__/tenant-route-harness";
import { openTestDb, seedTenant, type TestDb } from "#/__tests__/test-db";

const RUNNER_PRICE = "price_runner_test";
const STARTER_PRICE = "price_starter_test";
const RUNNER_YEARLY = "price_runner_year_test";
const STARTER_YEARLY = "price_starter_year_test";
const USER = "change-admin";

let test: TestDb;
let accountId: string;
let roleId: string;
let partyIds: string[] = [];
let runnerPlanId: string;
let starterPlanId: string;
let powers: AccessPower[] = ["company:plan:manage"];
const stripe = fakeStripe();
const app = tenantRouteApp(() => test, {
  stripe: () => stripe.gateway,
  sessionUserId: async () => USER,
  userHasPower: async (_c, _userId, _accountId, power) => powers.includes(power),
});

const planChange = async (planKey: string, interval?: string) => {
  const response = await callAs(app, accountId, "/usage/plan/change", { method: "POST", body: { planKey, interval } });
  return { status: response.status, text: await response.text() };
};
const subscribe = (planId: string, billingInterval: "month" | "year" = "month") =>
  test.raw.insert(tenantSubscriptions).values({ tenantId: accountId, planId, status: "active", source: "stripe", billingInterval, stripeCustomerId: "cus_1", stripeSubscriptionId: "sub_1" });
const grant = (planId: string) => test.raw.insert(tenantSubscriptions).values({ tenantId: accountId, planId, status: "active", source: "grant" });
const setPeople = async (count: number) => {
  if (count === 0) return;
  await test.raw.insert(partyRoles).values(partyIds.slice(0, count).map((partyId) => ({ partyId, tenantId: accountId, roleId, roleScope: "tenant" as const })));
};
const addInvites = async (count: number) => {
  for (let i = 0; i < count; i += 1) {
    await test.raw.insert(tenantTeamInvites).values({
      tenantId: accountId,
      email: `invited-${i}@example.com`,
      roleId,
      tokenHash: `hash-${i}`,
      invitedBy: partyIds[0],
      expiresAt: new Date(Date.now() + 86_400_000),
    });
  }
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
  await test.raw.update(platformMasterPlans).set({ stripePriceId: RUNNER_PRICE, stripeYearlyPriceId: RUNNER_YEARLY }).where(eq(platformMasterPlans.key, "runner"));
  await test.raw.update(platformMasterPlans).set({ stripePriceId: STARTER_PRICE, stripeYearlyPriceId: STARTER_YEARLY, enabled: true }).where(eq(platformMasterPlans.key, "starter"));
  [{ id: runnerPlanId }] = await test.raw.select({ id: platformMasterPlans.id }).from(platformMasterPlans).where(eq(platformMasterPlans.key, "runner"));
  [{ id: starterPlanId }] = await test.raw.select({ id: platformMasterPlans.id }).from(platformMasterPlans).where(eq(platformMasterPlans.key, "starter"));
});

afterAll(async () => {
  await test.close();
});

beforeEach(async () => {
  powers = ["company:plan:manage"];
  stripe.changes.length = 0;
  await test.raw.delete(tenantSubscriptions);
  await test.raw.delete(tenantTeamInvites);
  await test.raw.delete(partyRoles).where(eq(partyRoles.tenantId, accountId));
});

describe("POST /usage/plan/change", () => {
  it("swaps the Stripe subscription to the target plan's price and leaves tenant_subscriptions to the webhook", async () => {
    await subscribe(runnerPlanId);
    await setPeople(1);
    const { status, text } = await planChange("starter");
    const [row] = await test.raw.select().from(tenantSubscriptions).where(eq(tenantSubscriptions.tenantId, accountId));
    expect([status, JSON.parse(text), stripe.changes, row.planId]).toEqual([
      200,
      { data: { planKey: "starter" }, error: null },
      [{ subscriptionId: "sub_1", priceId: STARTER_PRICE, interval: "month" }],
      runnerPlanId,
    ]);
  });

  it("refuses a login without company:plan:manage", async () => {
    await subscribe(runnerPlanId);
    powers = ["company:plan:read"];
    const { status } = await planChange("starter");
    expect([status, stripe.changes.length]).toEqual([403, 0]);
  });

  it("refuses an operator grant", async () => {
    await grant(runnerPlanId);
    const { status } = await planChange("starter");
    expect([status, stripe.changes.length]).toEqual([409, 0]);
  });

  it("refuses the plan the Account is already on", async () => {
    await subscribe(runnerPlanId);
    const { status } = await planChange("runner");
    expect([status, stripe.changes.length]).toEqual([409, 0]);
  });

  it("refuses an Account with no subscription", async () => {
    const { status } = await planChange("starter");
    expect([status, stripe.changes.length]).toEqual([409, 0]);
  });

  it("refuses an unknown plan", async () => {
    await subscribe(runnerPlanId);
    const { status } = await planChange("nope");
    expect([status, stripe.changes.length]).toEqual([400, 0]);
  });

  it.each([
    { members: 3, invites: 0, status: 409, counts: "3 people and 0 pending invites" },
    { members: 2, invites: 1, status: 409, counts: "2 people and 1 pending invite," },
    { members: 2, invites: 0, status: 200, counts: "" },
  ])("to Starter with $members people and $invites invites answers $status", async ({ members, invites, status, counts }) => {
    await subscribe(runnerPlanId);
    await setPeople(members);
    await addInvites(invites);
    const answer = await planChange("starter");
    expect([answer.status, answer.text.includes(counts), stripe.changes.length]).toEqual([status, true, status === 200 ? 1 : 0]);
  });

  it("switches the same plan from monthly to yearly", async () => {
    await subscribe(runnerPlanId);
    await setPeople(1);
    const { status } = await planChange("runner", "year");
    expect([status, stripe.changes]).toEqual([200, [{ subscriptionId: "sub_1", priceId: RUNNER_YEARLY, interval: "year" }]]);
  });

  it("lets an Account over the member cap go from monthly to yearly on its own plan", async () => {
    await subscribe(starterPlanId);
    await setPeople(3);
    const { status } = await planChange("starter", "year");
    expect([status, stripe.changes]).toEqual([200, [{ subscriptionId: "sub_1", priceId: STARTER_YEARLY, interval: "year" }]]);
  });

  it("refuses yearly to monthly on the same plan, telling the admin to cancel at period end", async () => {
    await subscribe(runnerPlanId, "year");
    const { status, text } = await planChange("runner", "month");
    expect([status, text.includes("Cancel it in the billing portal"), stripe.changes.length]).toEqual([409, true, 0]);
  });

  it.each([
    { name: "no interval", interval: undefined },
    { name: "the interval it is on", interval: "year" },
  ])("refuses the plan and interval the Account is already on ($name)", async ({ interval }) => {
    await subscribe(runnerPlanId, "year");
    const { status } = await planChange("runner", interval);
    expect([status, stripe.changes.length]).toEqual([409, 0]);
  });

  it("refuses a change of plan and interval in one step", async () => {
    await subscribe(runnerPlanId);
    await setPeople(1);
    const { status } = await planChange("starter", "year");
    expect([status, stripe.changes.length]).toEqual([409, 0]);
  });

  it("keeps a yearly interval when the plan changes", async () => {
    await subscribe(runnerPlanId, "year");
    await setPeople(1);
    const { status } = await planChange("starter");
    expect([status, stripe.changes]).toEqual([200, [{ subscriptionId: "sub_1", priceId: STARTER_YEARLY, interval: "year" }]]);
  });

  it("refuses a yearly change over the member cap", async () => {
    await subscribe(runnerPlanId, "year");
    await setPeople(3);
    const { status } = await planChange("starter");
    expect([status, stripe.changes.length]).toEqual([409, 0]);
  });

  it("refuses a switch to yearly for a plan with no yearly price", async () => {
    await test.raw.update(platformMasterPlans).set({ stripeYearlyPriceId: null }).where(eq(platformMasterPlans.key, "runner"));
    await subscribe(runnerPlanId);
    const { status } = await planChange("runner", "year");
    await test.raw.update(platformMasterPlans).set({ stripeYearlyPriceId: RUNNER_YEARLY }).where(eq(platformMasterPlans.key, "runner"));
    expect([status, stripe.changes.length]).toEqual([400, 0]);
  });

  it("treats an old Stripe row with no interval as monthly", async () => {
    await test.raw.insert(tenantSubscriptions).values({ tenantId: accountId, planId: runnerPlanId, status: "active", source: "stripe", stripeCustomerId: "cus_1", stripeSubscriptionId: "sub_1" });
    const { status } = await planChange("runner", "year");
    expect([status, stripe.changes]).toEqual([200, [{ subscriptionId: "sub_1", priceId: RUNNER_YEARLY, interval: "year" }]]);
  });

  it("moves up from Starter to Runner", async () => {
    await subscribe(starterPlanId);
    await setPeople(2);
    const { status } = await planChange("runner");
    expect([status, stripe.changes]).toEqual([200, [{ subscriptionId: "sub_1", priceId: RUNNER_PRICE, interval: "month" }]]);
  });
});
