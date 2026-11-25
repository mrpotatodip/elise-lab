import { Effect } from "effect";
import { Conflict, Invalid, NotFound, type DbError, type ExternalError, type RateLimited } from "#/lib/effect-query";
import type { TenantEffect } from "#/lib/tenant-effect";
import { ScanOptionsSchema } from "#/schemas";
import { resumeSourceEffect } from "#/modules/scan-ledger";
import { RESUME_RUNNER_GONE_MESSAGE } from "#/modules/scans/constants";
import { abandonScanSvc, queueScanSvc, startScanSvc } from "./create-scan-svc";
import type { ScanQueued } from "#/modules/scans/schemas";
import type { SubmitScanDeps } from "#/modules/scans/types";
import { resumeRefusalOf } from "#/modules/scans/utils";
import type { Bindings } from "#/types/variables";

const JOB_OPTIONS_UNREADABLE = "This Scan's job options cannot be read, so it cannot be resumed. Start a new Scan.";

export const submitResumeSvc = (
  env: Bindings,
  tenant: TenantEffect,
  deps: SubmitScanDeps,
  accountId: string,
  scanId: string,
): Effect.Effect<ScanQueued, Invalid | RateLimited | Conflict | NotFound | DbError | ExternalError> =>
  tenant((db) =>
    Effect.gen(function* () {
      const source = yield* resumeSourceEffect(db, accountId, scanId);
      if (source === null) return yield* new NotFound({ message: "Scan not found" });
      const refusal = resumeRefusalOf(source);
      if (refusal?.kind === "conflict") return yield* new Conflict({ message: refusal.message });
      if (refusal) return yield* new Invalid({ message: refusal.message });
      if (source.job === null) return yield* new Invalid({ message: JOB_OPTIONS_UNREADABLE });
      const runnerId = source.job.runnerId;
      const options = yield* Effect.try(() => ScanOptionsSchema.parse(JSON.parse(source.job?.optionsJson ?? ""))).pipe(
        Effect.mapError(() => new Invalid({ message: JOB_OPTIONS_UNREADABLE })),
      );
      const sources = yield* deps.connectedRunnerSources(db, accountId, runnerId);
      if (sources === null) return yield* new Invalid({ message: RESUME_RUNNER_GONE_MESSAGE });
      const spend = yield* deps.monthSpend(db, accountId);
      return yield* queueScanSvc(
        env,
        deps.scanRepo(env, db),
        accountId,
        {
          repo: source.repoUrl,
          provider: source.provider,
          model: options.model,
          effort: options.effort,
          profile: options.profile,
          max_budget_usd: source.maxBudgetUsd,
          runner_id: runnerId,
          ref: source.ref ?? undefined,
          scope_paths: options.scopePaths,
          archive_id: source.archive?.archiveId ?? undefined,
        },
        spend,
        (newScanId, holdUsd) => deps.holdCredit(db, accountId, newScanId, holdUsd),
        (id) => deps.connectedRunnerSources(db, accountId, id),
        (link) => deps.linkArchive(db, accountId, link),
        scanId,
      );
    }),
  ).pipe(
    Effect.flatMap((queued) =>
      startScanSvc(env, queued, (error) =>
        tenant((db) =>
          abandonScanSvc(deps.scanRepo(env, db), queued, error, (id) => deps.releaseCredit(db, accountId, id)),
        ).pipe(Effect.ignore),
      ),
    ),
  );
