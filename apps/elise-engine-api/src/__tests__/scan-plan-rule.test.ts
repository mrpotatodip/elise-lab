import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { buildApp } from "#/index";
import { BILLING_NO_PLAN_MESSAGE, type PlanState } from "#/modules/billing";
import type { MonthSpend } from "#/modules/usage";
import type { Bindings } from "#/types/variables";
import { fakeBindings, TEST_TOKEN, testExecutionContext } from "./fake-bindings";
import { memoryScanRepo } from "./memory-scan-repo";
import { testDeps } from "./test-deps";

const ACCOUNT = "0b8c1d2e-3f4a-4b5c-8d6e-7f8091a2b3c4";
const REPO = "https://github.com/octocat/Hello-World";
const headers = { authorization: `Bearer ${TEST_TOKEN}`, "x-account-id": ACCOUNT, "content-type": "application/json" };

const NO_SPEND: MonthSpend = { spentUsd: 0, scans: 0, tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, budgetOverrideUsd: null, budgetAllowanceUsd: null, platformSpentUsd: 0, platformReservedUsd: 0, ownKey: false, plan: null };
const PRO: PlanState = {
  planKey: "pro",
  includedCreditUsd: 49,
  keySource: "platform",
  creditMarkup: 1.5,
  creditBalanceUsd: 100,
  monthlyScanAllowance: null,
  maxMembers: 5,
  status: "active",
  pastDueSince: null,
};
const BYOK: PlanState = { ...PRO, planKey: "byok", keySource: "account", includedCreditUsd: 0, creditBalanceUsd: 0 };

let spend: MonthSpend = NO_SPEND;

const app = buildApp(
  testDeps({
    scanRepo: () => memoryScanRepo().repo,
    monthSpend: async () => spend,
  }),
).app;

beforeEach(() => {
  spend = NO_SPEND;
});

const post = (env: Bindings, body: { repo: string; skill: string; profile: string }) => app.fetch(new Request("http://localhost/scans", { method: "POST", headers, body: JSON.stringify(body) }), env, testExecutionContext);
const ErrorBodySchema = z.object({ error: z.object({ code: z.string(), message: z.string() }) });

describe("POST /scans: a Monthly budget refusal names the profile that fits", () => {
  it("refuses deep under a $20 Monthly budget, names standard and takes no hold", async () => {
    spend = { ...NO_SPEND, plan: PRO, budgetOverrideUsd: 20 };
    const { env, createdFull } = fakeBindings();
    const res = await post(env, { repo: REPO, skill: "full", profile: "deep" });
    const error = ErrorBodySchema.parse(await res.json()).error;

    expect(res.status).toBe(429);
    expect(error.code).toBe("MONTHLY_BUDGET_EXCEEDED");
    expect(error.message).toContain("standard");
    expect(error.message).not.toContain("quick");
    expect(createdFull).toHaveLength(0);
  });

  it("names the biggest profile that fits after what the month already spent", async () => {
    spend = { ...NO_SPEND, plan: PRO, budgetOverrideUsd: 20, spentUsd: 6 };
    const { env } = fakeBindings();
    const res = await post(env, { repo: REPO, skill: "full", profile: "deep" });

    expect(ErrorBodySchema.parse(await res.json()).error.message).toContain("quick");
  });

  it("says no profile fits, and what is left, when even quick is too much", async () => {
    spend = { ...NO_SPEND, plan: PRO, budgetOverrideUsd: 20, spentUsd: 8 };
    const { env } = fakeBindings();
    const res = await post(env, { repo: REPO, skill: "full", profile: "standard" });
    const error = ErrorBodySchema.parse(await res.json()).error;

    expect(error.code).toBe("MONTHLY_BUDGET_EXCEEDED");
    expect(error.message).toContain("too low for any profile");
    expect(error.message).toContain("$8.00");
  });
});

describe("POST /scans: a full Scan on the platform's key needs a Plan", () => {
  it("refuses an Account with no Plan and no key of its own with NO_ACTIVE_PLAN", async () => {
    const { env, createdFull } = fakeBindings();
    const res = await post(env, { repo: REPO, skill: "full", profile: "quick" });

    expect(res.status).toBe(429);
    expect(ErrorBodySchema.parse(await res.json()).error).toEqual({ code: "NO_ACTIVE_PLAN", message: BILLING_NO_PLAN_MESSAGE });
    expect(createdFull).toHaveLength(0);
  });

  it.each([
    ["no Plan and a key of its own", { ...NO_SPEND, ownKey: true }],
    ["a bring-your-own-key Plan", { ...NO_SPEND, plan: BYOK, ownKey: true }],
    ["a platform Plan", { ...NO_SPEND, plan: PRO }],
  ])("starts a full Scan for %s", async (_name, account) => {
    spend = account;
    const { env, createdFull } = fakeBindings();
    const res = await post(env, { repo: REPO, skill: "full", profile: "quick" });

    expect(res.status).toBe(201);
    expect(createdFull).toHaveLength(1);
  });
});
