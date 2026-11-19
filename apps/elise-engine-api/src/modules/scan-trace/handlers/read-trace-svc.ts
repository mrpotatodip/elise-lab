import { Effect } from "effect";
import type { Trace, TraceQuery } from "@repo/contracts/elise";
import type { AppDbType } from "#/lib/db-connection";
import { NotFound, type DbError } from "#/lib/effect-query";
import { findTraceScanEffect, readTraceEntriesEffect } from "#/modules/scan-trace/queries";

export const readTraceSvc = (db: AppDbType, accountId: string, scanId: string, query: TraceQuery): Effect.Effect<Trace, NotFound | DbError> =>
  Effect.gen(function* () {
    const scan = yield* findTraceScanEffect(db, accountId, scanId);
    if (scan === undefined) return yield* Effect.fail(new NotFound({ message: "Scan not found" }));
    const rows = yield* readTraceEntriesEffect(db, accountId, scanId, query.after);
    const newest = rows.reduce<string | null>((max, row) => (max === null || row.cursor > max ? row.cursor : max), null);
    return {
      entries: rows.map((row) => ({
        id: row.id,
        label: row.label,
        phase: row.phase,
        startedAt: row.startedAt.toISOString(),
        endedAt: row.endedAt.toISOString(),
        count: row.count,
      })),
      cursor: newest ?? query.after ?? null,
      candidateFindings: scan.candidateFindings,
      now: new Date().toISOString(),
    };
  });
