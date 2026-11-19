import { Effect } from "effect";
import { TRACE_ENTRIES_PER_SCAN_MAX, type RunnerIdentity, type SaveTraceBody, type TraceSaved } from "@repo/contracts/elise";
import type { AppDbType } from "#/lib/db-connection";
import { NotFound, type DbError } from "#/lib/effect-query";
import { SCAN_TRACE_JOB_NOT_FOUND } from "#/modules/scan-trace/constants";
import { countTraceEntriesEffect, findJobRunnerEffect, knownTraceIdsEffect, setCandidateFindingsEffect, upsertTraceEntriesEffect } from "#/modules/scan-trace/queries";

export const saveTraceSvc = (db: AppDbType, runner: RunnerIdentity, scanId: string, body: SaveTraceBody): Effect.Effect<TraceSaved, NotFound | DbError> =>
  Effect.gen(function* () {
    const holder = yield* findJobRunnerEffect(db, runner.accountId, scanId);
    if (holder !== runner.runnerId) return yield* Effect.fail(new NotFound({ message: SCAN_TRACE_JOB_NOT_FOUND }));
    return yield* keepTraceBatchSvc(db, runner.accountId, scanId, body);
  });

export const keepTraceBatchSvc = (db: AppDbType, tenantId: string, scanId: string, body: SaveTraceBody): Effect.Effect<TraceSaved, DbError> =>
  Effect.gen(function* () {
    const entries = [...new Map(body.entries.map((entry) => [entry.id, entry])).values()];
    const known = yield* knownTraceIdsEffect(
      db,
      scanId,
      entries.map((entry) => entry.id),
    );
    const total = yield* countTraceEntriesEffect(db, scanId);
    const roomBeforeConcurrentBatches = Math.max(0, TRACE_ENTRIES_PER_SCAN_MAX - total);
    const fresh = entries.filter((entry) => !known.has(entry.id)).slice(0, roomBeforeConcurrentBatches);
    const kept = [...entries.filter((entry) => known.has(entry.id)), ...fresh];

    yield* upsertTraceEntriesEffect(db, tenantId, scanId, kept);
    if (body.candidateFindings !== undefined) yield* setCandidateFindingsEffect(db, tenantId, scanId, body.candidateFindings);
    return { accepted: kept.length, dropped: body.entries.length - kept.length };
  });
