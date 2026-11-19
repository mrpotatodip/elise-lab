import { and, asc, count, eq, gt, inArray, sql } from "drizzle-orm";
import { Effect } from "effect";
import { scanRunnerJobs, scans, scanTraceEntries } from "@repo/db-elise/schema";
import type { TraceEntry } from "@repo/contracts/elise";
import type { AppDbType } from "#/lib/db-connection";
import { toDbError, type DbError } from "#/lib/effect-query";
import { SCAN_TRACE_CURSOR_OVERLAP_SECONDS } from "#/modules/scan-trace/constants";
import type { TraceRow } from "#/modules/scan-trace/types";

// -----
// The cursor is the database's own time of a write, to the
// microsecond, as an ISO string. A JavaScript Date keeps only the
// millisecond, which would hand back the last write on every read.
// -----
const cursorOf = sql<string>`to_char(${scanTraceEntries.updatedAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`;

// -----
// The Runner that holds the Scan's job, or null when the Scan has
// none. The tenant filter stays here as well as in the row-level
// security.
// -----
export const findJobRunnerEffect = (db: AppDbType, tenantId: string, scanId: string): Effect.Effect<string | null, DbError> =>
  Effect.tryPromise({
    try: () =>
      db
        .select({ runnerId: scanRunnerJobs.runnerId })
        .from(scanRunnerJobs)
        .where(and(eq(scanRunnerJobs.tenantId, tenantId), eq(scanRunnerJobs.scanId, scanId)))
        .then(([row]) => row?.runnerId ?? null),
    catch: toDbError,
  });

// -----
// The Scan's candidate Finding count, or undefined when the Account
// has no such Scan.
// -----
export const findTraceScanEffect = (db: AppDbType, tenantId: string, scanId: string): Effect.Effect<{ candidateFindings: number | null } | undefined, DbError> =>
  Effect.tryPromise({
    try: () =>
      db
        .select({ candidateFindings: scans.traceCandidateFindings })
        .from(scans)
        .where(and(eq(scans.tenantId, tenantId), eq(scans.id, scanId)))
        .then(([row]) => row),
    catch: toDbError,
  });

export const countTraceEntriesEffect = (db: AppDbType, scanId: string): Effect.Effect<number, DbError> =>
  Effect.tryPromise({
    try: () =>
      db
        .select({ total: count() })
        .from(scanTraceEntries)
        .where(eq(scanTraceEntries.scanId, scanId))
        .then(([row]) => row?.total ?? 0),
    catch: toDbError,
  });

// -----
// Which of these ids the Scan already has: sending one again
// replaces it and never counts toward the cap.
// -----
export const knownTraceIdsEffect = (db: AppDbType, scanId: string, ids: readonly string[]): Effect.Effect<Set<string>, DbError> =>
  ids.length === 0
    ? Effect.succeed(new Set<string>())
    : Effect.tryPromise({
        try: () =>
          db
            .select({ id: scanTraceEntries.id })
            .from(scanTraceEntries)
            .where(and(eq(scanTraceEntries.scanId, scanId), inArray(scanTraceEntries.id, [...ids])))
            .then((rows) => new Set(rows.map((row) => row.id))),
        catch: toDbError,
      });

// -----
// Writes the entries, replacing any the Scan already has by id. Every
// written row takes the database's time as updated_at, read when the
// statement runs (clock_timestamp, not the transaction's start), so a
// reader's cursor never depends on the producer's clock.
// -----
export const upsertTraceEntriesEffect = (db: AppDbType, tenantId: string, scanId: string, entries: readonly TraceEntry[]): Effect.Effect<void, DbError> =>
  entries.length === 0
    ? Effect.void
    : Effect.tryPromise({
        try: () =>
          db
            .insert(scanTraceEntries)
            .values(
              entries.map((entry) => ({
                id: entry.id,
                tenantId,
                scanId,
                label: entry.label,
                phase: entry.phase,
                startedAt: new Date(entry.startedAt),
                endedAt: new Date(entry.endedAt),
                count: entry.count,
                updatedAt: sql`clock_timestamp()`,
              })),
            )
            .onConflictDoUpdate({
              target: [scanTraceEntries.scanId, scanTraceEntries.id],
              set: {
                label: sql`excluded.label`,
                phase: sql`excluded.phase`,
                startedAt: sql`excluded.started_at`,
                endedAt: sql`excluded.ended_at`,
                count: sql`excluded.count`,
                updatedAt: sql`clock_timestamp()`,
              },
            }),
        catch: toDbError,
      }).pipe(Effect.asVoid);

export const setCandidateFindingsEffect = (db: AppDbType, tenantId: string, scanId: string, candidateFindings: number): Effect.Effect<void, DbError> =>
  Effect.tryPromise({
    try: () =>
      db
        .update(scans)
        .set({ traceCandidateFindings: candidateFindings })
        .where(and(eq(scans.tenantId, tenantId), eq(scans.id, scanId))),
    catch: toDbError,
  }).pipe(Effect.asVoid);

// -----
// The Scan's entries written after the cursor (all of them without
// one), in display order: the producer's start time, then the id.
// -----
export const readTraceEntriesEffect = (db: AppDbType, tenantId: string, scanId: string, after: string | undefined): Effect.Effect<TraceRow[], DbError> =>
  Effect.tryPromise({
    try: () =>
      db
        .select({
          id: scanTraceEntries.id,
          label: scanTraceEntries.label,
          phase: scanTraceEntries.phase,
          startedAt: scanTraceEntries.startedAt,
          endedAt: scanTraceEntries.endedAt,
          count: scanTraceEntries.count,
          cursor: cursorOf,
        })
        .from(scanTraceEntries)
        .where(
          and(
            eq(scanTraceEntries.tenantId, tenantId),
            eq(scanTraceEntries.scanId, scanId),
            after === undefined ? undefined : gt(scanTraceEntries.updatedAt, sql`${after}::timestamptz - make_interval(secs => ${SCAN_TRACE_CURSOR_OVERLAP_SECONDS})`),
          ),
        )
        .orderBy(asc(scanTraceEntries.startedAt), asc(scanTraceEntries.id)),
    catch: toDbError,
  });
