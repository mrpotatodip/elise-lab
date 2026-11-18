import { Cause, Effect, Exit } from "effect";
import { beforeEach, describe, expect, it } from "vitest";
import { fakeBindings } from "#/__tests__/fake-bindings";
import { brokenScanRepo, memoryScanRepo } from "#/__tests__/memory-scan-repo";
import { ExternalError } from "#/lib/effect-query";
import type { PlanState } from "#/modules/billing";
import type { HoldCredit, ReleaseCredit } from "#/modules/credit";
import type { GithubAccess } from "#/modules/github-installs";
import type { ScanRepo } from "#/modules/scan-ledger";
import type { MonthSpend } from "#/modules/usage";
import { createScanSvc, detailScanSvc, readScanFileSvc } from "#/modules/scans/handlers";
import type { CreateScanBody } from "#/modules/scans/schemas";

const input: CreateScanBody = { repo: "https://github.com/octocat/Hello-World" };

const repoOf = (name: string) => ({ repo: `https://github.com/octocat/${name}` });

const down = async () => {
  throw new Error("down");
};

const NO_SPEND: MonthSpend = { spentUsd: 0, scans: 0, tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 }, budgetOverrideUsd: null, budgetAllowanceUsd: null, platformSpentUsd: 0, platformReservedUsd: 0, ownKey: false, plan: null };

// -----
// An Account on its own key and no Plan: every new Scan in our cloud runs
// the full Skill, and the platform's key needs a Plan, so a test that
// starts a default Scan and cares about nothing else uses this.
// -----
const OWN: MonthSpend = { ...NO_SPEND, ownKey: true };

let repo: ScanRepo;

beforeEach(() => {
  repo = memoryScanRepo().repo;
});

describe("createScanSvc", () => {
  it("queues a scan with the defaults", async () => {
    const { env, createdFull } = fakeBindings();
    const queued = await Effect.runPromise(createScanSvc(env, repo, "acme", input, OWN));

    expect(queued).toMatchObject({ status: "queued", skill: "full", profile: "quick", model: "claude-sonnet-5-5", maxBudgetUsd: 6 });
    expect(createdFull).toHaveLength(1);
  });

  it("records the scan in the ledger before the workflow starts", async () => {
    const { env } = fakeBindings();
    const queued = await Effect.runPromise(createScanSvc(env, repo, "acme", input, OWN));

    expect(await Effect.runPromise(repo.get("acme", queued.scanId))).toMatchObject({ status: "queued", repo: input.repo, step: null });
  });

  it("marks the scan failed when the workflow cannot start", async () => {
    // SAFETY: the service calls only create on the workflow.
    const { env } = fakeBindings({ SCAN_WORKFLOW_FULL: { create: down } as never });
    await Effect.runPromise(Effect.flip(createScanSvc(env, repo, "acme", input, OWN)));
    const [scan] = (await Effect.runPromise(repo.list("acme", 10))).scans;

    expect(scan).toMatchObject({ status: "failed" });
    expect(scan.error).toContain("could not start the workflow");
  });

  it("starts the workflow with the install GitHub access chose, asked for under the repo's own spelling", async () => {
    const { env, createdFull } = fakeBindings();
    const asked: string[] = [];
    const github = { installationRowId: "7c1e4a52-9d3b-4f60-8a71-2b3c4d5e6f70", installationId: 42, repoId: 7, repo: "octocat/hello-world", isPrivate: true };
    const access: GithubAccess = { forRepo: (url) => Effect.sync(() => (asked.push(url), github)) };

    await Effect.runPromise(createScanSvc(env, repo, "acme", { repo: "https://github.com/octocat/Hello-World.git" }, OWN, access));

    expect(asked).toEqual(["https://github.com/octocat/Hello-World"]);
    expect(createdFull[0]?.params.github).toEqual(github);
  });

  it("starts the workflow with no install when GitHub access has none", async () => {
    const { env, createdFull } = fakeBindings();
    const access: GithubAccess = { forRepo: () => Effect.succeed(null) };

    await Effect.runPromise(createScanSvc(env, repo, "acme", input, OWN, access));

    expect(createdFull[0]?.params.github).toBeUndefined();
  });

  it("queues nothing when GitHub access fails", async () => {
    const { env, createdFull } = fakeBindings();
    const access: GithubAccess = { forRepo: () => Effect.fail(new ExternalError({ cause: "down" })) };

    const error = await Effect.runPromise(Effect.flip(createScanSvc(env, repo, "acme", input, OWN, access)));

    expect(error._tag).toBe("ExternalError");
    expect(createdFull).toHaveLength(0);
    expect((await Effect.runPromise(repo.list("acme", 10))).scans).toEqual([]);
  });

  it("fails with DbError when the ledger is down", async () => {
    const error = await Effect.runPromise(Effect.flip(createScanSvc(fakeBindings().env, brokenScanRepo, "acme", input, OWN)));

    expect(error._tag).toBe("DbError");
  });

  it("fails with Invalid when the dollar cap is above the profile's cap", async () => {
    const error = await Effect.runPromise(Effect.flip(createScanSvc(fakeBindings().env, memoryScanRepo().repo, "acme", { ...input, max_budget_usd: 7 }, OWN)));

    expect(error._tag).toBe("Invalid");
  });

  it("fails with ExternalError when the workflow cannot start", async () => {
    // SAFETY: the service calls only create on the workflow.
    const { env } = fakeBindings({ SCAN_WORKFLOW_FULL: { create: down } as never });
    const error = await Effect.runPromise(Effect.flip(createScanSvc(env, repo, "acme", input, OWN)));

    expect(error._tag).toBe("ExternalError");
  });

  describe("the limits of each path", () => {
    const RUNNER = "0b8c1d2e-3f4a-4b5c-8d6e-7f8091a2b3c4";
    const start = (env: ReturnType<typeof fakeBindings>["env"], account: string, name: string) => Effect.runPromise(Effect.flip(createScanSvc(env, repo, account, repoOf(name), OWN)));
    const startOk = (env: ReturnType<typeof fakeBindings>["env"], account: string, name: string) => Effect.runPromise(createScanSvc(env, repo, account, repoOf(name), OWN));
    const startOnRunner = (env: ReturnType<typeof fakeBindings>["env"], account: string, name: string) =>
      Effect.runPromise(Effect.flip(createScanSvc(env, repo, account, { ...repoOf(name), runner_id: RUNNER }, RUNNER_SPEND(), undefined, undefined, () => Effect.succeed(true))));
    const startOnRunnerOk = (env: ReturnType<typeof fakeBindings>["env"], account: string, name: string) =>
      Effect.runPromise(createScanSvc(env, repo, account, { ...repoOf(name), runner_id: RUNNER }, RUNNER_SPEND(), undefined, undefined, () => Effect.succeed(true)));

    it("counts the Scans of one account in our cloud on MAX_ACTIVE_FULL_SCANS, and a Scan on a Runner on MAX_ACTIVE_SCANS", async () => {
      const { env } = fakeBindings({ MAX_ACTIVE_SCANS: "1", MAX_ACTIVE_FULL_SCANS: "1" });
      await startOk(env, "acme", "a");
      await startOnRunnerOk(env, "acme", "b");

      expect(await start(env, "acme", "c")).toMatchObject({ _tag: "RateLimited", code: "TOO_MANY_ACTIVE_SCANS", message: expect.stringContaining("full scans (limit 1)") });
      expect(await startOnRunner(env, "acme", "d")).toMatchObject({ _tag: "RateLimited", code: "TOO_MANY_ACTIVE_SCANS", message: expect.stringContaining("Runner scans (limit 1)") });
    });

    it("stores a Scan on a Runner as full, starts it on the full workflow and counts it on MAX_ACTIVE_SCANS only", async () => {
      const { env, createdFull } = fakeBindings({ MAX_ACTIVE_SCANS: "1", MAX_ACTIVE_FULL_SCANS: "0", MAX_GLOBAL_FULL_SCANS: "0" });
      const queued = await startOnRunnerOk(env, "acme", "a");

      expect(queued).toMatchObject({ status: "queued", skill: "full" });
      expect(await Effect.runPromise(repo.get("acme", queued.scanId))).toMatchObject({ skill: "full" });
      expect(createdFull).toHaveLength(1);
      expect(await startOnRunner(env, "acme", "b")).toMatchObject({ _tag: "RateLimited", code: "TOO_MANY_ACTIVE_SCANS", message: expect.stringContaining("Runner scans (limit 1)") });
      expect(await startOnRunnerOk(env, "other", "c")).toMatchObject({ status: "queued" });
    });

    it("does not use up the place of a full Scan in our cloud, nor the platform's", async () => {
      const { env, createdFull } = fakeBindings({ MAX_GLOBAL_FULL_SCANS: "1" });
      await startOnRunnerOk(env, "other", "a");
      await startOnRunnerOk(env, "acme", "b");
      await startOk(env, "acme", "c");

      expect(createdFull).toHaveLength(3);
      expect(await start(env, "someone", "d")).toMatchObject({ code: "SCAN_WORKER_BUSY" });
    });

    it("is not held back by a full Scan of its Account in our cloud", async () => {
      const { env } = fakeBindings({ MAX_ACTIVE_SCANS: "1" });
      await startOk(env, "acme", "a");

      expect(await startOnRunnerOk(env, "acme", "b")).toMatchObject({ status: "queued", skill: "full" });
    });
  });

  it("dies, and does not fail, when the default model in the config is not on the list", async () => {
    const { env } = fakeBindings({ MODEL: "not-a-model" });
    const exit = await Effect.runPromiseExit(createScanSvc(env, repo, "acme", input, OWN));

    expect(Exit.isFailure(exit) && Cause.isDie(exit.cause)).toBe(true);
  });

  it("refuses a scan that could pass the monthly budget", async () => {
    const { env } = fakeBindings();
    const spend = onPlan({}, { spentUsd: 19, budgetOverrideUsd: 20 });
    const error = await Effect.runPromise(Effect.flip(createScanSvc(env, memoryScanRepo().repo, "acme", input, spend)));

    expect(error).toMatchObject({ _tag: "RateLimited", code: "MONTHLY_BUDGET_EXCEEDED" });
  });

  it("lets a scan through when its cap still fits the budget", async () => {
    const { env } = fakeBindings();
    const spend = { ...OWN, spentUsd: 13 };
    const queued = await Effect.runPromise(createScanSvc(env, memoryScanRepo().repo, "acme", input, spend));

    expect(queued.status).toBe("queued");
  });

  it("uses the account's own budget when it has one", async () => {
    const { env } = fakeBindings();
    const spend = { ...OWN, spentUsd: 19, budgetOverrideUsd: 100 };
    const queued = await Effect.runPromise(createScanSvc(env, memoryScanRepo().repo, "acme", input, spend));

    expect(queued.status).toBe("queued");
  });
});

const TEAM: PlanState = {
  planKey: "pro",
  includedCreditUsd: 49,
  keySource: "platform",
  creditMarkup: 1.5,
  creditBalanceUsd: 49,
  monthlyScanAllowance: null,
  hostedScansAllowed: true,
  maxMembers: 5,
  status: "active",
  pastDueSince: null,
};
const held: number[] = [];
const hold: HoldCredit = (_scanId, holdUsd) => {
  held.push(holdUsd);
  return Effect.succeed({ held: true, balanceUsd: 0 });
};
const raced: HoldCredit = () => Effect.succeed({ held: false, balanceUsd: 1 });
const DAY = 24 * 60 * 60 * 1000;
const onPlan = (plan: Partial<PlanState>, rest: Partial<MonthSpend> = {}): MonthSpend => ({ ...NO_SPEND, plan: { ...TEAM, ...plan }, ...rest });

describe("createScanSvc: the plan", () => {
  const outcome = (spend: MonthSpend, enforced: string) => {
    const { env } = fakeBindings({ BILLING_ENFORCED: enforced });
    return Effect.runPromise(
      createScanSvc(env, memoryScanRepo().repo, "acme", input, spend, undefined, hold).pipe(
        Effect.match({ onSuccess: () => "queued", onFailure: (failure) => (failure._tag === "RateLimited" ? failure.code : failure._tag) }),
      ),
    );
  };

  it.each([
    ["no plan and no own key, billing not enforced", NO_SPEND, "false", "NO_ACTIVE_PLAN"],
    ["no plan and no own key, billing enforced", NO_SPEND, "true", "NO_ACTIVE_PLAN"],
    ["no plan and an own key, billing not enforced", OWN, "false", "queued"],
    ["an active plan", onPlan({}), "true", "queued"],
    ["a canceled plan", onPlan({ status: "canceled" }), "false", "NO_ACTIVE_PLAN"],
    ["a past due plan inside the grace period", onPlan({ status: "past_due", pastDueSince: new Date(Date.now() - 3 * DAY) }), "true", "queued"],
    ["a past due plan after the grace period", onPlan({ status: "past_due", pastDueSince: new Date(Date.now() - 8 * DAY) }), "true", "PAYMENT_FAILED"],
    ["an unpaid plan", onPlan({ status: "unpaid" }), "true", "PAYMENT_FAILED"],
  ])("with %s the scan is %s", async (_name, spend, enforced, expected) => {
    expect(await outcome(spend, enforced)).toBe(expected);
  });

  const BYOK: Partial<PlanState> = { planKey: "byok", keySource: "account", includedCreditUsd: 0, creditBalanceUsd: 0, monthlyScanAllowance: 300 };

  it.each([
    ["a platform plan with credit for the hold", onPlan({ creditBalanceUsd: 49 }), "queued"],
    ["a platform plan with exactly the hold left", onPlan({ creditBalanceUsd: 9 }), "queued"],
    ["a platform plan a cent short of the hold", onPlan({ creditBalanceUsd: 8.99 }), "INSUFFICIENT_CREDIT"],
    ["a platform plan with no credit", onPlan({ creditBalanceUsd: 0 }), "INSUFFICIENT_CREDIT"],
    ["a platform plan, whatever the month's spend", onPlan({}, { spentUsd: 500, platformSpentUsd: 500 }), "queued"],
    ["an account plan with the account's own key", onPlan(BYOK, { ownKey: true }), "queued"],
    ["an account plan with no own key", onPlan(BYOK, { ownKey: false }), "OWN_KEY_REQUIRED"],
    ["an account plan with its last allowed scan", onPlan(BYOK, { ownKey: true, scans: 299 }), "queued"],
    ["an account plan with its allowance used", onPlan(BYOK, { ownKey: true, scans: 300 }), "SCAN_ALLOWANCE_EXCEEDED"],
    ["a budget the admin set, counted in credit", onPlan({}, { spentUsd: 5, budgetOverrideUsd: 10 }), "MONTHLY_BUDGET_EXCEEDED"],
    ["a budget the admin set, with room in credit", onPlan({}, { spentUsd: 4, budgetOverrideUsd: 16 }), "queued"],
  ])("with %s the scan is %s", async (_name, spend, expected) => {
    expect(await outcome(spend, "true")).toBe(expected);
  });

  it("says in the refusal that a top up is the way out", async () => {
    const { env } = fakeBindings();
    const failure = await Effect.runPromise(Effect.flip(createScanSvc(env, memoryScanRepo().repo, "acme", input, onPlan({ creditBalanceUsd: 1 }), undefined, hold)));

    expect(failure).toMatchObject({ message: expect.stringContaining("Top up in Settings") });
  });

  it("holds the scan's budget cap times the markup", async () => {
    held.length = 0;
    const { env } = fakeBindings();
    await Effect.runPromise(createScanSvc(env, memoryScanRepo().repo, "acme", { ...input, max_budget_usd: 1 }, onPlan({}), undefined, hold));

    expect(held).toEqual([1.5]);
  });

  it("takes no hold for a scan on the account's own key", async () => {
    held.length = 0;
    const { env } = fakeBindings();
    await Effect.runPromise(createScanSvc(env, memoryScanRepo().repo, "acme", input, onPlan(BYOK, { ownKey: true }), undefined, hold));

    expect(held).toEqual([]);
  });

  it("fails a scan whose hold lost the race and does not start it", async () => {
    const { env, createdFull } = fakeBindings();
    const mem = memoryScanRepo();
    const failure = await Effect.runPromise(Effect.flip(createScanSvc(env, mem.repo, "acme", input, onPlan({}), undefined, raced)));

    expect(failure).toMatchObject({ _tag: "RateLimited", code: "INSUFFICIENT_CREDIT" });
    expect([...mem.rows.values()].map((row) => row.status)).toEqual(["failed"]);
    expect(createdFull).toEqual([]);
  });

  it("gives the hold back when the workflow cannot start", async () => {
    const released: string[] = [];
    const release: ReleaseCredit = (scanId) => {
      released.push(scanId);
      return Effect.succeed({ settled: true, chargeUsd: 0 });
    };
    // SAFETY: the service calls only create on the workflow.
    const { env } = fakeBindings({ SCAN_WORKFLOW_FULL: { create: down } as never });
    const mem = memoryScanRepo();
    await Effect.runPromise(Effect.flip(createScanSvc(env, mem.repo, "acme", input, onPlan({}), undefined, hold, undefined, release)));

    expect(released).toEqual([...mem.rows.keys()]);
  });

  it.each([
    ["no plan and an own key", { ...NO_SPEND, ownKey: true }, "account"],
    ["a platform plan, even with an own key saved", onPlan({}, { ownKey: true }), "platform"],
    ["an account plan with its own key", onPlan(BYOK, { ownKey: true }), "account"],
  ])("with %s the scan uses the %s key", async (_name, spend, expected) => {
    const { env, createdFull } = fakeBindings();
    await Effect.runPromise(createScanSvc(env, memoryScanRepo().repo, "acme", input, spend, undefined, hold));

    expect(createdFull[0].params.keySource).toBe(expected);
  });
});

const outcomeOf = (spend: MonthSpend, body: CreateScanBody = input) => {
  const { env } = fakeBindings();
  return Effect.runPromise(
    createScanSvc(env, memoryScanRepo().repo, "acme", body, spend, undefined, hold).pipe(
      Effect.match({ onSuccess: () => "queued", onFailure: (failure) => (failure._tag === "RateLimited" ? failure.code : failure._tag) }),
    ),
  );
};

describe("createScanSvc: the cap of a profile and the monthly budget by key", () => {
  it.each([
    ["the platform's key, above the profile's cap", onPlan({}), 7, "Invalid"],
    ["the platform's key, at the profile's cap", onPlan({}), 6, "queued"],
    ["the account's own key, above the profile's cap", OWN, 7, "Invalid"],
    ["the account's own key, at the profile's cap", OWN, 6, "queued"],
  ])("a request for a limit on %s: the scan is %s", async (_name, spend, limit, expected) => {
    expect(await outcomeOf(spend, { ...input, max_budget_usd: limit })).toBe(expected);
  });

  it("defaults the limit of a scan on the account's own key to its profile's cap", async () => {
    const { env, createdFull } = fakeBindings();
    await Effect.runPromise(createScanSvc(env, memoryScanRepo().repo, "acme", input, OWN));

    expect(createdFull[0].params.options.maxBudgetUsd).toBe(6);
  });

  it.each([
    ["a platform plan, over a budget the admin set", onPlan({}, { spentUsd: 19.5, budgetOverrideUsd: 20 }), "MONTHLY_BUDGET_EXCEEDED"],
    ["no plan, the account's own key, over the default budget", { ...OWN, spentUsd: 500 }, "queued"],
    ["no plan, the account's own key, over a budget the admin set", { ...OWN, spentUsd: 500, budgetOverrideUsd: 10 }, "MONTHLY_BUDGET_EXCEEDED"],
  ])("with %s the scan is %s", async (_name, spend, expected) => {
    expect(await outcomeOf(spend)).toBe(expected);
  });
});

const connected = () => Effect.succeed(true);
const gone = () => Effect.succeed(false);
const RUNNER_SPEND = (): MonthSpend => onPlan({ planKey: "runner", keySource: "account", includedCreditUsd: 0, creditBalanceUsd: 0 });

describe("createScanSvc: a Runner", () => {
  const RUNNER = "5b3f0d7e-61a4-4c2f-9d58-2f7a1c9e4b10";
  const onRunner: CreateScanBody = { ...input, runner_id: RUNNER };
  const BYOK_PLAN: Partial<PlanState> = { planKey: "byok", keySource: "account", includedCreditUsd: 0, creditBalanceUsd: 0, monthlyScanAllowance: 300 };

  const outcome = (spend: MonthSpend, runnerConnected: () => Effect.Effect<boolean>, body: CreateScanBody = onRunner) => {
    const { env } = fakeBindings({ BILLING_ENFORCED: "true" });
    return Effect.runPromise(
      createScanSvc(env, memoryScanRepo().repo, "acme", body, spend, undefined, hold, runnerConnected).pipe(
        Effect.match({ onSuccess: () => "queued", onFailure: (failure) => (failure._tag === "RateLimited" ? failure.code : failure._tag) }),
      ),
    );
  };

  it.each([
    ["a platform plan with no credit", onPlan({ creditBalanceUsd: 0 }), "queued"],
    ["an account plan with no own key", onPlan(BYOK_PLAN, { ownKey: false }), "queued"],
    ["an account plan with its allowance used", onPlan(BYOK_PLAN, { ownKey: true, scans: 300 }), "queued"],
    ["a month that is over the budget the admin set", onPlan({}, { spentUsd: 500, budgetOverrideUsd: 10 }), "queued"],
    ["a canceled plan", onPlan({ status: "canceled" }), "NO_ACTIVE_PLAN"],
  ])("with %s a scan on a connected runner is %s", async (_name, spend, expected) => {
    expect(await outcome(spend, connected)).toBe(expected);
  });

  it("stores a scan on a runner full on the full workflow", async () => {
    const { env, createdFull } = fakeBindings();
    const mem = memoryScanRepo();
    const queued = await Effect.runPromise(createScanSvc(env, mem.repo, "acme", onRunner, RUNNER_SPEND(), undefined, hold, connected));

    expect(queued.skill).toBe("full");
    expect(mem.rows.get(queued.scanId)?.skill).toBe("full");
    expect(createdFull).toHaveLength(1);
  });

  it("keeps the Runner's own ceiling and takes no credit, no Plan and no monthly budget", async () => {
    held.length = 0;
    const { env, createdFull } = fakeBindings({ BILLING_ENFORCED: "true" });
    const spend = onPlan({ creditBalanceUsd: 0 }, { spentUsd: 500, budgetOverrideUsd: 10 });
    await Effect.runPromise(createScanSvc(env, memoryScanRepo().repo, "acme", { ...onRunner, profile: "deep" }, spend, undefined, hold, connected));

    expect(held).toEqual([]);
    expect(createdFull[0].params).toMatchObject({ runnerId: RUNNER, keySource: "account", options: { skill: "full", profile: "deep", maxBudgetUsd: 50 } });
  });

  it("gives a scan on a runner the safety cap by default and refuses a limit above it", async () => {
    const { env, createdFull } = fakeBindings();
    await Effect.runPromise(createScanSvc(env, memoryScanRepo().repo, "acme", onRunner, RUNNER_SPEND(), undefined, hold, connected));

    expect(createdFull[0].params.options.maxBudgetUsd).toBe(50);
    expect(await outcome(RUNNER_SPEND(), connected, { ...onRunner, max_budget_usd: 60 })).toBe("Invalid");
  });

  it("refuses a runner that is not connected to the account", async () => {
    expect(await outcome(onPlan({}), gone)).toBe("Invalid");
  });

  it("refuses a runner when the caller cannot check it", async () => {
    const { env } = fakeBindings();
    const failure = await Effect.runPromise(Effect.flip(createScanSvc(env, memoryScanRepo().repo, "acme", onRunner, RUNNER_SPEND())));

    expect(failure).toMatchObject({ _tag: "Invalid" });
  });

  it("starts the workflow with the runner, takes no hold and uses no platform key", async () => {
    held.length = 0;
    const { env, createdFull } = fakeBindings();
    await Effect.runPromise(createScanSvc(env, memoryScanRepo().repo, "acme", onRunner, onPlan({}), undefined, hold, connected));

    expect(held).toEqual([]);
    expect(createdFull[0].params).toMatchObject({ runnerId: RUNNER, keySource: "account" });
  });

  it("refuses a private repository, which only the container can read", async () => {
    const { env, createdFull } = fakeBindings();
    const github ={ installationRowId: "7c1e4a52-9d3b-4f60-8a71-2b3c4d5e6f70", installationId: 42, repoId: 7, repo: "octocat/hello-world", isPrivate: true };
    const access: GithubAccess = { forRepo: () => Effect.succeed(github) };
    const failure = await Effect.runPromise(Effect.flip(createScanSvc(env, memoryScanRepo().repo, "acme", onRunner, RUNNER_SPEND(), access, hold, connected)));

    expect(failure).toMatchObject({ _tag: "Invalid" });
    expect(createdFull).toEqual([]);
  });
});

describe("createScanSvc: the ref", () => {
  const paramsOf = async (ref: string | undefined) => {
    const { env, createdFull } = fakeBindings();
    await Effect.runPromise(createScanSvc(env, memoryScanRepo().repo, "acme", { ...input, ref }, OWN));
    return createdFull[0].params;
  };

  it("keeps a branch, a tag and a commit as they were typed, and leaves it to the clone to tell which", async () => {
    expect((await paramsOf("release")).ref).toBe("release");
    expect((await paramsOf("v1.0.0")).ref).toBe("v1.0.0");
    expect((await paramsOf("7495881".padEnd(40, "a"))).ref).toBe("7495881".padEnd(40, "a"));
  });

  it("reads refs/heads/release as release, and knows Release is not release", async () => {
    expect((await paramsOf("refs/heads/release")).ref).toBe("release");
    expect((await paramsOf("Release")).ref).toBe("Release");
  });

  it("takes HEAD, and no ref, as a plain scan of the default branch", async () => {
    expect((await paramsOf("HEAD")).ref).toBeUndefined();
    expect((await paramsOf(undefined)).ref).toBeUndefined();
  });
});

describe("detailScanSvc", () => {
  it("fails with NotFound for a scan that does not exist", async () => {
    const error = await Effect.runPromise(Effect.flip(detailScanSvc(fakeBindings().env, repo, "acme", "none")));

    expect(error._tag).toBe("NotFound");
  });

  it("fails with DbError when the ledger is down", async () => {
    const error = await Effect.runPromise(Effect.flip(detailScanSvc(fakeBindings().env, brokenScanRepo, "acme", "abc")));

    expect(error._tag).toBe("DbError");
  });

  it("keeps the saved status when the workflow lookup fails", async () => {
    // SAFETY: the service calls only create and get on the workflow.
    const { env } = fakeBindings({ SCAN_WORKFLOW_FULL: { create: async () => undefined, get: down } as never });
    const queued = await Effect.runPromise(createScanSvc(env, repo, "acme", input, OWN));
    const status = await Effect.runPromise(detailScanSvc(env, repo, "acme", queued.scanId));

    expect(status.status).toBe("queued");
  });

  it("fails a scan whose workflow errored", async () => {
    // SAFETY: the service calls only create and get on the workflow.
    const { env } = fakeBindings({
      SCAN_WORKFLOW_FULL: { create: async () => undefined, get: async () => ({ status: async () => ({ status: "errored", error: { name: "Error", message: "boom" } }) }) } as never,
    });
    const queued = await Effect.runPromise(createScanSvc(env, repo, "acme", input, OWN));
    const status = await Effect.runPromise(detailScanSvc(env, repo, "acme", queued.scanId));

    expect(status).toMatchObject({ status: "failed", error: "boom" });
  });

  it("lists the files a scan saved, with their sizes", async () => {
    const { env } = fakeBindings();
    const queued = await Effect.runPromise(createScanSvc(env, repo, "acme", input, OWN));
    await Effect.runPromise(
      repo.addFiles("acme", queued.scanId, [{ name: "REPORT.md", r2Key: "k", sizeBytes: 7, contentType: "text/markdown; charset=utf-8" }]),
    );
    const status = await Effect.runPromise(detailScanSvc(env, repo, "acme", queued.scanId));

    expect(status).toMatchObject({ files: ["REPORT.md"], artifacts: [{ name: "REPORT.md", sizeBytes: 7 }] });
  });
});

describe("readScanFileSvc", () => {
  it("fails with NotFound for a file the ledger does not list", async () => {
    const error = await Effect.runPromise(Effect.flip(readScanFileSvc(fakeBindings().env.REPORTS, repo, "acme", "abc", "REPORT.md")));

    expect(error._tag).toBe("NotFound");
  });

  it("fails with NotFound when the ledger lists a file that R2 lost", async () => {
    await Effect.runPromise(
      repo.addFiles("acme", "abc", [{ name: "REPORT.md", r2Key: "accounts/acme/scans/abc/REPORT.md", sizeBytes: 1, contentType: "text/markdown; charset=utf-8" }]),
    );
    const error = await Effect.runPromise(Effect.flip(readScanFileSvc(fakeBindings().env.REPORTS, repo, "acme", "abc", "REPORT.md")));

    expect(error._tag).toBe("NotFound");
  });

  it("fails with NotFound for a key outside the account's prefix, even when R2 holds it", async () => {
    const { env, store } = fakeBindings();
    store.set("accounts/other/scans/abc/REPORT.md", "# theirs");
    await Effect.runPromise(
      repo.addFiles("acme", "abc", [{ name: "REPORT.md", r2Key: "accounts/other/scans/abc/REPORT.md", sizeBytes: 8, contentType: "text/markdown; charset=utf-8" }]),
    );
    const error = await Effect.runPromise(Effect.flip(readScanFileSvc(env.REPORTS, repo, "acme", "abc", "REPORT.md")));

    expect(error._tag).toBe("NotFound");
  });

  it("returns the bytes with the type the ledger recorded", async () => {
    const { env, store } = fakeBindings();
    store.set("accounts/acme/scans/abc/REPORT.md", "# r");
    await Effect.runPromise(
      repo.addFiles("acme", "abc", [{ name: "REPORT.md", r2Key: "accounts/acme/scans/abc/REPORT.md", sizeBytes: 3, contentType: "text/markdown; charset=utf-8" }]),
    );
    const file = await Effect.runPromise(readScanFileSvc(env.REPORTS, repo, "acme", "abc", "REPORT.md"));

    expect(file.contentType).toBe("text/markdown; charset=utf-8");
  });
});
