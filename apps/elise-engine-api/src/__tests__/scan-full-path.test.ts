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
const OTHER_ACCOUNT = "5d1f0a9e-6b2c-4e3d-9a8b-1c2d3e4f5a6b";
const repoOf = (name: string) => `https://github.com/octocat/${name}`;

const NO_SPEND: MonthSpend = { spentUsd: 0, scans: 0, tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, budgetOverrideUsd: null, budgetAllowanceUsd: null, platformSpentUsd: 0, platformReservedUsd: 0, ownKey: false, plan: null };
const PRO: PlanState = {
  planKey: "pro",
  includedCreditUsd: 49,
  keySource: "platform",
  creditMarkup: 1.5,
  creditBalanceUsd: 1000,
  monthlyScanAllowance: null,
  maxMembers: 5,
  status: "active",
  pastDueSince: null,
};

let spend: MonthSpend;
let store: ReturnType<typeof memoryScanRepo>;
let app: ReturnType<typeof buildApp>["app"];

beforeEach(() => {
  spend = { ...NO_SPEND, plan: PRO };
  store = memoryScanRepo();
  app = buildApp(testDeps({ scanRepo: () => store.repo, monthSpend: async () => spend })).app;
});

type Body = { repo: string; profile?: string };
const post = (env: Bindings, body: Body, account = ACCOUNT) =>
  app.fetch(
    new Request("http://localhost/scans", {
      method: "POST",
      headers: { authorization: `Bearer ${TEST_TOKEN}`, "x-account-id": account, "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
    env,
    testExecutionContext,
  );

const QueuedSchema = z.object({ data: z.object({ scanId: z.string(), skill: z.string(), profile: z.string(), maxBudgetUsd: z.number() }) });
const ErrorSchema = z.object({ error: z.object({ code: z.string(), message: z.string() }) });

describe("POST /scans: every new Scan runs the full path", () => {
  it.each([
    ["a platform Plan", { ...NO_SPEND, plan: PRO }],
    ["its own key and no Plan", { ...NO_SPEND, ownKey: true }],
  ])("starts a Scan with a profile and no skill on the full path for %s, stored as full", async (_name, account) => {
    spend = account;
    const { env, createdFull } = fakeBindings();
    const res = await post(env, { repo: repoOf("a"), profile: "standard" });
    const queued = QueuedSchema.parse(await res.json()).data;

    expect(res.status).toBe(201);
    expect(queued).toMatchObject({ skill: "full", profile: "standard", maxBudgetUsd: 12 });
    expect(store.rows.get(queued.scanId)?.skill).toBe("full");
    expect(createdFull).toHaveLength(1);
  });

  it("uses quick when the request names no profile", async () => {
    const { env } = fakeBindings();
    const queued = QueuedSchema.parse(await (await post(env, { repo: repoOf("a") })).json()).data;

    expect(queued).toMatchObject({ skill: "full", profile: "quick", maxBudgetUsd: 6 });
  });

  it("answers a request that still sends skill as if the field were not there: queued, stored full", async () => {
    const { env, createdFull } = fakeBindings();
    const sent: Body & { skill: string } = { repo: repoOf("a"), profile: "deep", skill: "lite" };
    const res = await post(env, sent);

    expect(res.status).toBe(201);
    expect(QueuedSchema.parse(await res.json()).data).toMatchObject({ skill: "full", profile: "deep", maxBudgetUsd: 18 });
    expect(createdFull).toHaveLength(1);
  });

  it("refuses an Account with no Plan and no key of its own", async () => {
    spend = NO_SPEND;
    const { env, createdFull } = fakeBindings();
    const res = await post(env, { repo: repoOf("a") });

    expect(res.status).toBe(429);
    expect(ErrorSchema.parse(await res.json()).error.code).toBe("NO_ACTIVE_PLAN");
    expect(createdFull).toHaveLength(0);
  });
});

describe("POST /scans: the limits of the full path", () => {
  it("refuses a second live Scan of one Account, with no queue", async () => {
    const { env, createdFull } = fakeBindings();
    await post(env, { repo: repoOf("a") });
    const res = await post(env, { repo: repoOf("b") });

    expect(res.status).toBe(429);
    expect(ErrorSchema.parse(await res.json()).error.code).toBe("TOO_MANY_ACTIVE_SCANS");
    expect(createdFull).toHaveLength(1);
  });

  it("refuses a fourth Scan across the platform with the busy message, with no queue", async () => {
    const accounts = [OTHER_ACCOUNT, "6e2a1b0f-7c3d-4f4e-8b9c-2d3e4f5a6b7c", "7f3b2c1a-8d4e-4a5f-9cad-3e4f5a6b7c8d", "8a4c3d2b-9e5f-4b60-8dbe-4f5a6b7c8d9e"];
    const { env, createdFull } = fakeBindings();
    const answers: Response[] = [];
    for (const [index, account] of accounts.entries()) {
      answers.push(await post(env, { repo: repoOf(`r${index}`) }, account));
    }

    expect(answers.map((answer) => answer.status)).toEqual([201, 201, 201, 429]);
    expect(ErrorSchema.parse(await answers[3].json()).error).toMatchObject({ code: "SCAN_WORKER_BUSY", message: expect.stringContaining("Try again in a few minutes") });
    expect(createdFull).toHaveLength(3);
  });
});
