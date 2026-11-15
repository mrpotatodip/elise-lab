import { beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { buildApp } from "#/index";
import type { PlanState } from "#/modules/billing";
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
let held: number[] = [];

const app = buildApp(
  testDeps({
    scanRepo: () => memoryScanRepo().repo,
    monthSpend: async () => spend,
    holdCredit: async (_env, _accountId, _scanId, holdUsd) => {
      held.push(holdUsd);
      return { held: true, balanceUsd: 0 };
    },
  }),
).app;

beforeEach(() => {
  spend = { ...NO_SPEND, plan: PRO };
  held = [];
});

type Body = { repo: string; skill?: string; profile?: string; max_budget_usd?: number };
const post = (env: Bindings, body: Body) => app.fetch(new Request("http://localhost/scans", { method: "POST", headers, body: JSON.stringify(body) }), env, testExecutionContext);
const getCredit = (env: Bindings) => app.fetch(new Request("http://localhost/usage/credit", { headers }), env, testExecutionContext);

const ScanBodySchema = z.object({ data: z.object({ maxBudgetUsd: z.number(), profile: z.string() }) });
const ErrorBodySchema = z.object({ error: z.object({ code: z.string(), message: z.string() }) });

describe("POST /scans: the cap of a profile", () => {
  it.each([
    ["quick", 6, 9],
    ["standard", 12, 18],
    ["deep", 18, 27],
  ])("gives a full %s scan with no cap in the request $%s and holds $%s", async (profile, cap, hold) => {
    const { env } = fakeBindings();
    const res = await post(env, { repo: REPO, skill: "full", profile });

    expect(res.status).toBe(201);
    expect(ScanBodySchema.parse(await res.json()).data).toMatchObject({ profile, maxBudgetUsd: cap });
    expect(held).toEqual([hold]);
  });

  it("uses a request cap below the profile's cap", async () => {
    const { env } = fakeBindings();
    const res = await post(env, { repo: REPO, skill: "full", profile: "standard", max_budget_usd: 5 });

    expect(ScanBodySchema.parse(await res.json()).data.maxBudgetUsd).toBe(5);
    expect(held).toEqual([7.5]);
  });

  it("refuses a request cap above the profile's cap, and takes no hold", async () => {
    const { env } = fakeBindings();
    const res = await post(env, { repo: REPO, skill: "full", profile: "standard", max_budget_usd: 13 });

    expect(res.status).toBe(400);
    expect(held).toEqual([]);
  });

  it("refuses a profile whose cap is above the ceiling for full scans before any hold, and still starts a profile under it", async () => {
    const { env, createdFull } = fakeBindings({ MAX_BUDGET_FULL_USD: "10" });
    const refused = await post(env, { repo: REPO, skill: "full", profile: "deep", max_budget_usd: 4 });
    const started = await post(env, { repo: `${REPO}-2`, skill: "full", profile: "quick" });

    expect(refused.status).toBeGreaterThanOrEqual(400);
    expect(ErrorBodySchema.parse(await refused.json()).error.message).toContain("ceiling");
    expect(started.status).toBe(201);
    expect(held).toEqual([9]);
    expect(createdFull).toHaveLength(1);
  });

  it("refuses with INSUFFICIENT_CREDIT when the balance is below the hold", async () => {
    spend = { ...NO_SPEND, plan: { ...PRO, creditBalanceUsd: 17.99 } };
    const { env } = fakeBindings();
    const res = await post(env, { repo: REPO, skill: "full", profile: "standard" });

    expect(res.status).toBe(429);
    expect(ErrorBodySchema.parse(await res.json()).error.code).toBe("INSUFFICIENT_CREDIT");
    expect(held).toEqual([]);
  });

  it("gives a full scan on the account's own key the same table, not the own-key ceiling of lite", async () => {
    spend = { ...NO_SPEND, ownKey: true };
    const { env } = fakeBindings();
    const res = await post(env, { repo: REPO, skill: "full", profile: "deep" });

    expect(ScanBodySchema.parse(await res.json()).data.maxBudgetUsd).toBe(18);
    expect(held).toEqual([]);
  });

  it("keeps the lite ceiling for a lite request, whatever profile it names", async () => {
    const { env } = fakeBindings();
    const res = await post(env, { repo: REPO, skill: "lite", profile: "deep" });

    expect(ScanBodySchema.parse(await res.json()).data.maxBudgetUsd).toBe(2);
  });
});

describe("GET /usage/credit: the cap and hold of each profile", () => {
  const ProfilesSchema = z.object({ data: z.object({ profiles: z.array(z.object({ profile: z.string(), capUsd: z.number(), holdUsd: z.number().nullable() })) }) });

  it.each([
    ["a platform plan", { ...NO_SPEND, plan: PRO }, [9, 18, 27]],
    ["an account plan on its own key", { ...NO_SPEND, plan: BYOK, ownKey: true }, [null, null, null]],
    ["no plan", NO_SPEND, [null, null, null]],
  ])("lists the caps 6, 12 and 18 dollars with the holds of %s", async (_name, account, holds) => {
    spend = account;
    const { env } = fakeBindings();
    const res = await getCredit(env);

    expect(ProfilesSchema.parse(await res.json()).data.profiles).toEqual([
      { profile: "quick", capUsd: 6, holdUsd: holds[0] },
      { profile: "standard", capUsd: 12, holdUsd: holds[1] },
      { profile: "deep", capUsd: 18, holdUsd: holds[2] },
    ]);
  });
});
