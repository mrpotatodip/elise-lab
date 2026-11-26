import { platformMasterPlans } from "@repo/db-elise/schema";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";
import { PlanOffersSchema } from "@repo/contracts/elise";
import { callAs, tenantRouteApp } from "#/__tests__/tenant-route-harness";
import { openTestDb, seedTenant, type TestDb } from "#/__tests__/test-db";

let test: TestDb;
let accountId: string;
const app = tenantRouteApp(() => test, { sessionUserId: async () => "user-1" });

beforeAll(async () => {
  test = await openTestDb();
  accountId = (await seedTenant(test, "acme")).tenantId;
});

afterAll(async () => {
  await test.close();
});

describe("GET /usage/plan/offers", () => {
  it("offers the Runner plan and no other: $35, 5 members, no credit", async () => {
    const res = await callAs(app, accountId, "/usage/plan/offers");
    const body = z.object({ data: PlanOffersSchema, error: z.null() }).parse(await res.json());

    expect(res.status).toBe(200);
    expect(body.data).toEqual([
      {
        key: "runner",
        label: "Runner",
        monthlyPriceUsd: 35,
        yearlyPriceUsd: null,
        includedCreditUsd: 0,
        maxMembers: 5,
      },
    ]);
  });

  it("shows the yearly price only once the plan has its Stripe yearly price", async () => {
    await test.raw
      .update(platformMasterPlans)
      .set({ stripeYearlyPriceId: "price_runner_year_test" })
      .where(eq(platformMasterPlans.key, "runner"));
    const res = await callAs(app, accountId, "/usage/plan/offers");
    const body = z.object({ data: PlanOffersSchema, error: z.null() }).parse(await res.json());
    await test.raw
      .update(platformMasterPlans)
      .set({ stripeYearlyPriceId: null })
      .where(eq(platformMasterPlans.key, "runner"));
    expect(body.data.map((offer) => offer.yearlyPriceUsd)).toEqual([350]);
  });
});
