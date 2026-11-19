import { Effect } from "effect";
import { TRACE_ENTRIES_PER_SCAN_MAX, type RunnerIdentity, type SaveTraceBody, type TraceSaved } from "@repo/contracts/elise";
import type { AppDbType } from "#/lib/db-connection";
import { NotFound, type DbError } from "#/lib/effect-query";
import { SCAN_TRACE_JOB_NOT_FOUND } from "#/modules/scan-trace/constants";
import { countTraceEntriesEffect, findJobRunnerEffect, knownTraceIdsEffect, setCandidateFindingsEffect, upsertTraceEntriesEffect } from "#/modules/scan-trace/queries";

// -----
// A Runner's batch of Trace entries for a Scan it holds. An entry the
// Scan already has is replaced, so a retried batch adds nothing and a
// grown entry is written again. A new entry past the per-Scan cap is
// dropped, not refused: the producer must never retry it, and the
// Scan goes on whatever happens here. Runs as the Runner's Account.
// -----
export const saveTraceSvc = (db: AppDbType, runner: RunnerIdentity, scanId: string, body: SaveTraceBody): Effect.Effect<TraceSaved, NotFound | DbError> =>
  Effect.gen(function* () {
    const holder = yield* findJobRunnerEffect(db, runner.accountId, scanId);
    if (holder !== runner.runnerId) return yield* Effect.fail(new NotFound({ message: SCAN_TRACE_JOB_NOT_FOUND }));

    const entries = [...new Map(body.entries.map((entry) => [entry.id, entry])).values()];
    const known = yield* knownTraceIdsEffect(
      db,
      scanId,
      entries.map((entry) => entry.id),
    );
    const total = yield* countTraceEntriesEffect(db, scanId);
    const room = Math.max(0, TRACE_ENTRIES_PER_SCAN_MAX - total);
    const fresh = entries.filter((entry) => !known.has(entry.id)).slice(0, room);
    const kept = [...entries.filter((entry) => known.has(entry.id)), ...fresh];

    yield* upsertTraceEntriesEffect(db, runner.accountId, scanId, kept);
    if (body.candidateFindings !== undefined) yield* setCandidateFindingsEffect(db, runner.accountId, scanId, body.candidateFindings);
    return { accepted: kept.length, dropped: body.entries.length - kept.length };
  });
