import { Effect } from "effect";
import {
  Invalid,
  RateLimited,
  toExternalError,
  type Conflict,
  type DbError,
  type ExternalError,
} from "#/lib/effect-query";
import { ScanOptionsSchema, type ScanParams } from "#/schemas";
import { normalizeBranchName } from "#/modules/branches";
import {
  RUNNER_ARCHIVE_UNSUPPORTED,
  RUNNER_JOB_NOT_CONNECTED,
  RUNNER_PLAN_HOSTED_MESSAGE,
} from "#/modules/runners/constants";
import { newScanId } from "#/modules/scan-store";
import type { ScanRepo } from "#/modules/scan-ledger";
import type { CreateScanBody, ScanQueued } from "#/modules/scans/schemas";
import type { CreateScanEnv, LinkArchive, QueuedScan, RunnerSources, SubmitScanDeps } from "#/modules/scans/types";
import { budgetCapOf, budgetRefusalHintOf, limitPathOf, scanRefusalOf } from "#/modules/scans/utils";
import { scanBlockOf } from "#/modules/billing";
import { holdOf, type HoldCredit, type ReleaseCredit } from "#/modules/credit";
import { budgetUsdOf, reservedUsdOf, type MonthSpend } from "#/modules/usage";
import type { TenantEffect } from "#/lib/tenant-effect";
import { DEFAULT_SOURCE_PROVIDER_ID, sourceProviderOf } from "#/providers/registry";
import { SCANS_RUNNER_ONLY_MESSAGE, SCANS_SCOPE_RUNNER_ONLY_MESSAGE } from "#/modules/scans/constants";
import type { Bindings } from "#/types/variables";

export const ARCHIVE_NOT_LINKED = "archive_id: this Scan cannot read a zip";

// -----
// Everything a new Scan writes: the checks, the Scan row and the
// credit hold. POST /scans runs it in one withTenant transaction,
// so a refusal after the row is written leaves no row and no hold.
// -----
export const queueScanSvc = (
  env: CreateScanEnv,
  repo: Pick<ScanRepo, "ensureRepo" | "restoreRepo" | "create" | "mark" | "activeSince">,
  accountId: string,
  input: CreateScanBody,
  spend: MonthSpend,
  hold?: HoldCredit,
  runnerSources?: RunnerSources,
  linkArchive?: LinkArchive,
  actorUserId?: string,
  resumesScanId?: string,
): Effect.Effect<QueuedScan, Invalid | RateLimited | Conflict | DbError | ExternalError> =>
  Effect.gen(function* () {
    const provider = sourceProviderOf(input.provider ?? DEFAULT_SOURCE_PROVIDER_ID);
    if (!provider.capabilities.cloudScans && input.runner_id === undefined)
      return yield* new Invalid({ message: SCANS_RUNNER_ONLY_MESSAGE });

    // -----
    // The per-scan ceiling follows who pays. A scan on a Runner runs
    // on the person's own Claude and has a safety ceiling. A scan on the
    // account's own key is paid by that key, so it gets a higher
    // ceiling than a scan on EliseLAB's key. A request may set the limit
    // anywhere up to that ceiling on a Runner, and only lower it in the cloud.
    //
    // The Skill is ours to choose, never the request's: every new Scan
    // runs the full Skill on the one Workflow and is stored `full`. The
    // request has no `skill` field, so one that sends it is stripped like
    // any unknown key. That holds for a Scan on a Runner too:
    // it runs the full Skill on the person's computer, takes no credit
    // and stops at the Scan's spend limit. No profile means quick.
    // -----
    const ownKeyScan =
      input.runner_id !== undefined || (spend.plan ? spend.plan.keySource === "account" : spend.ownKey);
    const profile = input.profile ?? "quick";
    const cap = budgetCapOf(env, { profile, onRunner: input.runner_id !== undefined });
    if (!cap.ok) return yield* new Invalid({ message: cap.message });
    const maxBudgetUsd = input.max_budget_usd ?? cap.defaultUsd;
    if (maxBudgetUsd > cap.ceilingUsd)
      return yield* new Invalid({ message: `max_budget_usd: must be at most ${cap.ceilingUsd}` });

    const scopePaths = input.scope_paths?.length ? input.scope_paths : undefined;
    if (scopePaths !== undefined && input.runner_id === undefined)
      return yield* new Invalid({ message: SCANS_SCOPE_RUNNER_ONLY_MESSAGE });

    const options = yield* Effect.try(() =>
      ScanOptionsSchema.parse({
        skill: "full",
        model: input.model ?? env.MODEL,
        effort: input.effort ?? env.EFFORT,
        profile,
        maxBudgetUsd,
        scopePaths,
      }),
    ).pipe(Effect.orDie);

    // -----
    // A Scan on the platform's key needs a Plan, whatever
    // BILLING_ENFORCED says: it is the Scan that costs EliseLAB money.
    // BILLING_ENFORCED keeps its wider rule (own-key and Runner Scans
    // too) and is not turned on here.
    // -----
    // -----
    // A Runner Scan needs a plan too, so an Account with none starts
    // no Scan of either kind. On the Runner plan only a Runner Scan
    // may start: the plan has no credit and no key, so a hosted Scan
    // is refused with a pointer to the Runners page. Checked by plan
    // key, because the plan's keySource would send it down the
    // own-key path.
    // -----
    const block = scanBlockOf(
      spend.plan,
      env.BILLING_ENFORCED === "true" || !ownKeyScan || input.runner_id !== undefined,
      new Date(),
    );
    if (block) return yield* new RateLimited(block);
    if (spend.plan?.hostedScansAllowed === false && input.runner_id === undefined) {
      return yield* new RateLimited({ code: "RUNNER_PLAN_HOSTED", message: RUNNER_PLAN_HOSTED_MESSAGE });
    }

    // -----
    // Each pool counts on its own, for the Account. Every Scan that runs
    // in our cloud meets MAX_ACTIVE_FULL_SCANS. A Scan on a Runner meets
    // only MAX_ACTIVE_SCANS, and the live Scans on a Runner are counted
    // there too, never against the full limit.
    // -----
    const limitPath = limitPathOf({
      skill: options.skill,
      runner: input.runner_id === undefined ? null : { id: input.runner_id },
    });
    const nowMs = Date.now();
    const activeScans = yield* repo.activeSince(accountId, nowMs);
    const refusal = scanRefusalOf(env, limitPath, activeScans.filter((scan) => limitPathOf(scan) === limitPath).length);
    if (refusal) return yield* new RateLimited(refusal);

    // -----
    // A Scan on a Runner runs on the person's own Claude, so it takes
    // no credit, needs no key of the Account's, and does not count
    // against the plan's allowance or the monthly budget. The Runner
    // must belong to the Account and be paired. An archive Scan also
    // needs a Runner that said it reads archives: an older one would
    // never be handed the job, so the person is told to update it.
    // -----
    const runnerId = input.runner_id;
    if (runnerId !== undefined) {
      const sources = runnerSources ? yield* runnerSources(runnerId) : null;
      if (sources === null) return yield* new Invalid({ message: RUNNER_JOB_NOT_CONNECTED });
      if (provider.capabilities.isArchive && !sources.includes("archive"))
        return yield* new Invalid({ message: RUNNER_ARCHIVE_UNSUPPORTED });
    }
    const onRunner = runnerId !== undefined;

    // -----
    // The plan decides the key. A platform plan always uses the
    // platform's key and takes credit for the scan; an account plan
    // needs the Account's own key and takes none. An Account with no
    // plan uses its own key when it has one, as before.
    // -----
    const plan = spend.plan;
    const usesOwnKey = onRunner || (plan ? plan.keySource === "account" : spend.ownKey);
    if (!onRunner && plan?.keySource === "account" && !spend.ownKey) {
      return yield* new RateLimited({
        code: "OWN_KEY_REQUIRED",
        message: "This plan runs scans on your own Anthropic key. Add it in Settings to run scans.",
      });
    }
    if (!onRunner && plan && plan.monthlyScanAllowance !== null && spend.scans >= plan.monthlyScanAllowance) {
      return yield* new RateLimited({
        code: "SCAN_ALLOWANCE_EXCEEDED",
        message: `This plan allows ${plan.monthlyScanAllowance} scans a month and this account has used them. The allowance starts again on the 1st`,
      });
    }
    const holdUsd = !onRunner && plan && plan.keySource === "platform" ? holdOf(maxBudgetUsd, plan.creditMarkup) : 0;
    if (plan && holdUsd > plan.creditBalanceUsd) {
      return yield* new RateLimited({
        code: "INSUFFICIENT_CREDIT",
        message: `This scan could take up to $${holdUsd.toFixed(2)} of credit, but the balance is $${Math.max(0, plan.creditBalanceUsd).toFixed(2)}. Top up in Settings`,
      });
    }

    // -----
    // The monthly budget is an optional guard for an Account on a plan:
    // it applies once an admin sets one, and counts in credit dollars
    // (cost times the markup). An Account with no plan has it too,
    // unless the scan runs on its own key: that key pays for itself,
    // so only a budget an admin set on purpose can stop it.
    // -----
    if (!onRunner && (spend.budgetOverrideUsd !== null || (plan === null && !usesOwnKey))) {
      const markup = plan && plan.keySource === "platform" ? plan.creditMarkup : 1;
      const budgetUsd = budgetUsdOf(spend, env);
      const reservedUsd = reservedUsdOf(activeScans);
      const usedUsd = (spend.spentUsd + reservedUsd + maxBudgetUsd) * markup;
      if (usedUsd > budgetUsd) {
        const leftUsd = budgetUsd - (spend.spentUsd + reservedUsd) * markup;
        const hint = `. ${budgetRefusalHintOf(profile, leftUsd, markup)}`;
        return yield* new RateLimited({
          code: "MONTHLY_BUDGET_EXCEEDED",
          message: `This scan could cost up to $${(maxBudgetUsd * markup).toFixed(2)}, but only $${Math.max(0, leftUsd).toFixed(2)} of the $${budgetUsd} monthly budget is left${hint}`,
        });
      }
    }

    const record = yield* repo.ensureRepo(accountId, input.repo, input.provider);
    // -----
    // One spelling per branch (refs/heads/x is x, HEAD is no ref).
    // Whether the ref is a branch, a tag or a commit is settled by
    // the clone, which tries it as a branch first.
    // -----
    const ref = input.ref === undefined ? undefined : (normalizeBranchName(input.ref) ?? undefined);
    const params: ScanParams = {
      scanId: newScanId(),
      accountId,
      repo: record.url,
      ref,
      options,
      keySource: usesOwnKey ? "account" : "platform",
      runnerId,
      resumesScanId,
      createdAt: new Date().toISOString(),
    };
    yield* repo.create(params, record.id, Date.now());
    // -----
    // An upload Scan must have its link: the schema made archive_id
    // required for an archive provider, and here the zip must be
    // one of this app's. A refusal rolls the Scan row back.
    // -----
    const { fixedBranch } = provider;
    if (fixedBranch !== null || input.archive_id !== undefined) {
      if (!linkArchive || fixedBranch === null || input.archive_id === undefined)
        return yield* new Invalid({ message: ARCHIVE_NOT_LINKED });
      yield* linkArchive({
        scanId: params.scanId,
        repoId: record.id,
        archiveId: input.archive_id,
        branch: fixedBranch,
      });
    }
    yield* repo.restoreRepo(accountId, record.id, actorUserId);
    // -----
    // The check above read the balance; this takes it, under a lock.
    // A scan that lost the race to another is failed, not started.
    // -----
    if (holdUsd > 0) {
      if (!hold) return yield* Effect.die(new Error("a platform plan needs a credit hold"));
      const held = yield* hold(params.scanId, holdUsd);
      if (!held.held) {
        yield* repo
          .mark(accountId, params.scanId, { status: "failed", error: "not enough credit for this scan" })
          .pipe(Effect.ignore);
        return yield* new RateLimited({
          code: "INSUFFICIENT_CREDIT",
          message: `This scan could take up to $${holdUsd.toFixed(2)} of credit, but the balance is $${Math.max(0, held.balanceUsd).toFixed(2)}. Top up in Settings`,
        });
      }
    }
    return { params, holdUsd };
  });

// -----
// A scan whose workflow never starts is never settled by one: it
// is marked failed and its hold is given back.
// -----
export const abandonScanSvc = (
  repo: Pick<ScanRepo, "mark">,
  queued: QueuedScan,
  error: string,
  release?: ReleaseCredit,
): Effect.Effect<void> =>
  Effect.all(
    [
      repo
        .mark(queued.params.accountId, queued.params.scanId, {
          status: "failed",
          error,
          ...(queued.params.resumesScanId !== undefined && { resumesScanId: null }),
        })
        .pipe(Effect.ignore),
      queued.holdUsd > 0 && release ? release(queued.params.scanId).pipe(Effect.ignore) : Effect.void,
    ],
    { discard: true },
  );

// -----
// Starts the Workflow of a queued Scan. The Workflow reads the
// Scan row and its hold, so it starts only once they are
// committed; abandon runs when it will not start.
// -----
export const startScanSvc = (
  env: CreateScanEnv,
  queued: QueuedScan,
  abandon: (error: string) => Effect.Effect<void>,
): Effect.Effect<ScanQueued, ExternalError> =>
  Effect.tryPromise({
    try: () => env.SCAN_WORKFLOW_FULL.create({ id: queued.params.scanId, params: queued.params }),
    catch: toExternalError,
  }).pipe(
    Effect.tapError((error) => abandon(`could not start the workflow: ${String(error.cause)}`)),
    Effect.as({ scanId: queued.params.scanId, status: "queued" as const, ...queued.params.options }),
  );

// -----
// Queue and start on one connection, for the service tests.
// -----
export const createScanSvc = (
  env: CreateScanEnv,
  repo: ScanRepo,
  accountId: string,
  input: CreateScanBody,
  spend: MonthSpend,
  hold?: HoldCredit,
  runnerSources?: RunnerSources,
  release?: ReleaseCredit,
): Effect.Effect<ScanQueued, Invalid | RateLimited | Conflict | DbError | ExternalError> =>
  queueScanSvc(env, repo, accountId, input, spend, hold, runnerSources).pipe(
    Effect.flatMap((queued) => startScanSvc(env, queued, (error) => abandonScanSvc(repo, queued, error, release))),
  );

// -----
// POST /scans. The Scan row and its hold commit as the Account in
// one transaction, so a refused Scan leaves neither. The Workflow
// reads both on its own connection, so it starts after the commit;
// if it will not start, a second transaction fails the Scan and
// gives the hold back.
// -----
export const submitScanSvc = (
  env: Bindings,
  tenant: TenantEffect,
  deps: SubmitScanDeps,
  accountId: string,
  input: CreateScanBody,
  actorUserId?: string,
): Effect.Effect<ScanQueued, Invalid | RateLimited | Conflict | DbError | ExternalError> =>
  tenant((db) =>
    deps.monthSpend(db, accountId).pipe(
      Effect.flatMap((spend) =>
        queueScanSvc(
          env,
          deps.scanRepo(env, db),
          accountId,
          input,
          spend,
          (scanId, holdUsd) => deps.holdCredit(db, accountId, scanId, holdUsd),
          (runnerId) => deps.connectedRunnerSources(db, accountId, runnerId),
          (link) => deps.linkArchive(db, accountId, link),
          actorUserId,
        ),
      ),
    ),
  ).pipe(
    Effect.flatMap((queued) =>
      startScanSvc(env, queued, (error) =>
        tenant((db) =>
          abandonScanSvc(deps.scanRepo(env, db), queued, error, (scanId) => deps.releaseCredit(db, accountId, scanId)),
        ).pipe(Effect.ignore),
      ),
    ),
  );
