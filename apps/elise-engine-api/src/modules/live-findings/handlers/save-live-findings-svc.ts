import { Effect } from "effect";
import {
  LIVE_FINDINGS_PER_SCAN_MAX,
  LiveFindingRecordSchema,
  type LiveFindingRecord,
  type LiveFindingsSaved,
  type RunnerIdentity,
  type SaveLiveFindingsBody,
} from "@repo/contracts/elise";
import type { AppDbType } from "#/lib/db-connection";
import { Conflict, NotFound, toExternalError, type DbError, type ExternalError } from "#/lib/effect-query";
import { LIVE_FINDINGS_JOB_NOT_FOUND, LIVE_FINDINGS_NOT_RUNNING } from "#/modules/live-findings/constants";
import { liveFindingIdsEffect, lockScanStatusEffect, replaceLiveFindingsEffect } from "#/modules/live-findings/queries";
import { sealFindingRowsSvc } from "#/modules/scan-records/handlers";
import { fullFindingRowOf } from "#/modules/scan-records/utils";
import { sealerEffect } from "#/modules/sealed-data";
import { findJobRunnerEffect } from "#/modules/scan-trace/queries";

export const saveLiveFindingsSvc = (
  db: AppDbType,
  runner: RunnerIdentity,
  scanId: string,
  body: SaveLiveFindingsBody,
  masterKey: string | undefined,
): Effect.Effect<LiveFindingsSaved, NotFound | Conflict | DbError | ExternalError> =>
  Effect.gen(function* () {
    const holder = yield* findJobRunnerEffect(db, runner.accountId, scanId);
    if (holder !== runner.runnerId) return yield* new NotFound({ message: LIVE_FINDINGS_JOB_NOT_FOUND });
    const scan = yield* lockScanStatusEffect(db, runner.accountId, scanId);
    if (scan === null) return yield* new NotFound({ message: LIVE_FINDINGS_JOB_NOT_FOUND });
    if (scan.status !== "running") return yield* new Conflict({ message: LIVE_FINDINGS_NOT_RUNNING });
    const sealer = yield* sealerEffect(db, masterKey, runner.accountId);

    const parsed = body.findings.flatMap((record) => {
      const result = LiveFindingRecordSchema.safeParse(record);
      return result.success ? [result.data] : [];
    });
    const records = [
      ...new Map<string, LiveFindingRecord>(parsed.map((record) => [record.fingerprint, record])).values(),
    ];
    const rows = yield* Effect.tryPromise({
      try: () =>
        Promise.all(records.map((record) => fullFindingRowOf(record, { accountId: runner.accountId, scanId }))),
      catch: toExternalError,
    });
    const stored = yield* liveFindingIdsEffect(db, scanId);
    const rowOf = new Map(
      yield* Effect.tryPromise({
        try: () =>
          Promise.all(
            stored.map(async (row): Promise<[string, string]> => [await sealer.open.text(row.findingId), row.id]),
          ),
        catch: toExternalError,
      }),
    );
    const room = Math.max(0, LIVE_FINDINGS_PER_SCAN_MAX - stored.length);
    const kept = [
      ...rows.filter((row) => rowOf.has(row.findingId)),
      ...rows.filter((row) => !rowOf.has(row.findingId)).slice(0, room),
    ];
    const sealed = yield* sealFindingRowsSvc(db, sealer, runner.accountId, scan.repoId, kept);

    yield* replaceLiveFindingsEffect(
      db,
      kept.flatMap((row) => rowOf.get(row.findingId) ?? []),
      sealed,
    );
    return { accepted: kept.length, dropped: body.findings.length - kept.length };
  });
