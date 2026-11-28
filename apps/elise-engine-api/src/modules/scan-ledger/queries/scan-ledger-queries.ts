import { and, asc, eq, gt, inArray, ne, sql } from "drizzle-orm";
import { Effect } from "effect";
import type { ScanUsage } from "@repo/contracts/elise";
import {
  scanFiles,
  scanFindings,
  scanRepos,
  scanRunnerJobs,
  scans,
  tenantCreditLedger,
  tenantRunners,
} from "@repo/db-elise/schema";
import { SCAN_SERVABLE_FILES } from "#/constants";
import type { AppDbType, AppTxDbType, DbConnectType } from "#/lib/db-connection";
import { Conflict, NotFound, toDbError, toExternalError, type DbError, type ExternalError } from "#/lib/effect-query";
import { scanArchivesEffect } from "#/modules/archives/queries";
import { actorPartyOf, insertAuditEntry } from "#/modules/audit-trail";
import { PG_UNIQUE_VIOLATION, pgErrorCode, pgErrorConstraint } from "#/lib/pg-error";
import { RESUME_ALREADY_RESUMED_MESSAGE } from "#/modules/scans/constants";
import type { ScanParams, ScanStatus } from "#/schemas";
import { CANNOT_READ, sealerEffect, unsealerEffect, type Unsealer } from "#/modules/sealed-data";
import type { ScanPage, ScanReads, ScanRepo } from "#/modules/scan-ledger/types";
import {
  displayRepoUrlOf,
  liveScansSql,
  REPO_LIMIT_MESSAGE,
  repoIdentityOf,
  restoreRemovedRepo,
  sameRepoIdentity,
  scanRowToStatus,
  stalledScansSql,
  summaryOf,
} from "#/modules/scan-ledger/utils";

type ScanRow = typeof scans.$inferSelect;

const ACTIVE_SCAN_CONFLICT = "This repo already has an active scan";
export const SCAN_ALREADY_ENDED = "This Scan already ended";
export const SEAL_FAILED_ERROR = "the scan failed and its error could not be stored";

// -----
// The Runner each of these scans is on, from its job row. A scan
// has a job row once its Workflow has queued the job, a few seconds
// after it starts.
// -----
const runnersOf = (db: AppDbType, ids: string[]) =>
  Effect.tryPromise({
    try: () =>
      db
        .select({
          scanId: scanRunnerJobs.scanId,
          id: tenantRunners.id,
          name: tenantRunners.name,
          optionsJson: scanRunnerJobs.optionsJson,
        })
        .from(scanRunnerJobs)
        .leftJoin(tenantRunners, eq(tenantRunners.id, scanRunnerJobs.runnerId))
        .where(inArray(scanRunnerJobs.scanId, ids)),
    catch: toDbError,
  });

type RunnerJob = { scanId: string; id: string | null; name: string | null; optionsJson: string };

const openStatusText = (
  unsealer: Unsealer,
  rows: ScanRow[],
  jobs: RunnerJob[],
): Effect.Effect<{ rows: ScanRow[]; jobs: RunnerJob[] }> =>
  Effect.promise(async () => ({
    rows: await Promise.all(rows.map(async (row) => ({ ...row, error: await unsealer.textOrNull(row.error) }))),
    jobs: await Promise.all(
      jobs.map(async (job) => {
        const optionsJson = await unsealer.text(job.optionsJson);
        return { ...job, optionsJson: optionsJson === CANNOT_READ ? "{}" : optionsJson };
      }),
    ),
  }));

const runnerOfJob = (job: RunnerJob | undefined) =>
  job?.id != null && job.name !== null ? { id: job.id, name: job.name } : null;

// -----
// An Account's live scans. Callers count these scans and add up
// their budget caps, so the rows come back with no files and no
// finding counts: a queued or running scan has no summary, and two
// more queries on the path of every new scan would buy nothing.
// They do carry their Runner, because a scan on a Runner is counted
// apart from one in our cloud.
// -----
export const activeScansEffect = (
  db: AppDbType,
  accountId: string,
  nowMs: number,
  masterKey?: string,
): Effect.Effect<ScanStatus[], DbError> =>
  Effect.gen(function* () {
    const unsealer = yield* unsealerEffect(db, masterKey, accountId);
    const found = yield* Effect.tryPromise({
      try: () =>
        db
          .select()
          .from(scans)
          .where(and(eq(scans.tenantId, accountId), liveScansSql(nowMs))),
      catch: toDbError,
    });
    const foundJobs =
      found.length === 0
        ? []
        : yield* runnersOf(
            db,
            found.map((row) => row.id),
          );
    const { rows, jobs: runners } = yield* openStatusText(unsealer, found, foundJobs);
    return rows.map((row) => {
      const job = runners.find((runner) => runner.scanId === row.id);
      return scanRowToStatus(row, [], null, runnerOfJob(job), null, job?.optionsJson);
    });
  });

// -----
// The rows with their files, the Runner a scan ran on and, for a
// scan whose findings are recorded, the counts of what it found.
// -----
const withFiles = (db: AppDbType, found: ScanRow[], unsealer: Unsealer): Effect.Effect<ScanStatus[], DbError> =>
  found.length === 0
    ? Effect.succeed([])
    : Effect.gen(function* () {
        const ids = found.map((row) => row.id);
        const files = yield* Effect.tryPromise({
          try: () =>
            db
              .select({
                scanId: scanFiles.scanId,
                name: scanFiles.name,
                sizeBytes: scanFiles.sizeBytes,
                contentType: scanFiles.contentType,
              })
              .from(scanFiles)
              .where(and(inArray(scanFiles.scanId, ids), inArray(scanFiles.name, [...SCAN_SERVABLE_FILES])))
              .orderBy(asc(scanFiles.name)),
          catch: toDbError,
        });
        const counts = yield* Effect.tryPromise({
          try: () =>
            db
              .select({
                scanId: scanFindings.scanId,
                status: scanFindings.status,
                severity: scanFindings.severity,
                origin: scanFindings.origin,
                total: sql<number>`count(*)::int`,
              })
              .from(scanFindings)
              .where(inArray(scanFindings.scanId, ids))
              .groupBy(scanFindings.scanId, scanFindings.status, scanFindings.severity, scanFindings.origin),
          catch: toDbError,
        });
        const { rows, jobs: runners } = yield* openStatusText(unsealer, found, yield* runnersOf(db, ids));
        const archives = yield* scanArchivesEffect(db, ids, unsealer);
        const resumers = yield* Effect.tryPromise({
          try: () =>
            db
              .select({ id: scans.id, resumes: scans.resumesScanId })
              .from(scans)
              .where(inArray(scans.resumesScanId, ids)),
          catch: toDbError,
        });
        return rows.map((row) => {
          const job = runners.find((runner) => runner.scanId === row.id);
          return scanRowToStatus(
            row,
            files
              .filter((file) => file.scanId === row.id)
              .map(({ name, sizeBytes, contentType }) => ({ name, sizeBytes, contentType })),
            summaryOf(
              row,
              counts.filter((count) => count.scanId === row.id),
            ),
            runnerOfJob(job),
            archives.get(row.id) ?? null,
            job?.optionsJson,
            resumers.find((resumer) => resumer.resumes === row.id)?.id ?? null,
          );
        });
      });

// -----
// The reads a route makes, on any client: the owner
// connection, or a withTenant transaction that holds them
// to one Account. A scan id starts with an inverted
// timestamp, so ascending ids are newest first and an id
// is a cursor.
// -----
export const scanReads = (db: AppDbType, masterKey?: string): ScanReads => ({
  list: (accountId, limit, cursor, filter): Effect.Effect<ScanPage, DbError> =>
    Effect.tryPromise({
      try: () =>
        db
          .select()
          .from(scans)
          .where(
            and(
              eq(scans.tenantId, accountId),
              cursor ? gt(scans.id, cursor) : undefined,
              filter?.repoId ? eq(scans.repoId, filter.repoId) : undefined,
              filter?.status ? eq(scans.status, filter.status) : undefined,
            ),
          )
          .orderBy(asc(scans.id))
          .limit(limit + 1),
      catch: toDbError,
    }).pipe(
      Effect.flatMap((rows) =>
        unsealerEffect(db, masterKey, accountId).pipe(
          Effect.flatMap((unsealer) => withFiles(db, rows.slice(0, limit), unsealer)),
          Effect.map((page) => ({ scans: page, nextCursor: rows.length > limit ? rows[limit - 1].id : null })),
        ),
      ),
    ),

  get: (accountId, scanId) =>
    Effect.tryPromise({
      try: () =>
        db
          .select()
          .from(scans)
          .where(and(eq(scans.tenantId, accountId), eq(scans.id, scanId))),
      catch: toDbError,
    }).pipe(
      Effect.flatMap((rows) =>
        Effect.flatMap(unsealerEffect(db, masterKey, accountId), (unsealer) => withFiles(db, rows, unsealer)),
      ),
      Effect.map((found) => found[0] ?? null),
    ),

  file: (accountId, scanId, name) =>
    Effect.tryPromise({
      try: () =>
        db
          .select({ r2Key: scanFiles.r2Key, contentType: scanFiles.contentType })
          .from(scanFiles)
          .where(and(eq(scanFiles.tenantId, accountId), eq(scanFiles.scanId, scanId), eq(scanFiles.name, name))),
      catch: toDbError,
    }).pipe(Effect.map((rows) => rows[0] ?? null)),
});

// -----
// What a new scan writes, in order: first close what a scan of
// this repo that stalled still holds (its credit hold, given back
// with no charge, and its Runner job, cancelled so a late report
// is refused), then expire it, then insert. The unique index on
// active scans refuses a second live scan.
// -----
const createStatements = (db: AppDbType, params: ScanParams, repoId: string, nowMs: number) => {
  const stalled = db
    .select({ id: scans.id })
    .from(scans)
    .where(and(eq(scans.repoId, repoId), stalledScansSql(nowMs)));
  return [
    db
      .insert(tenantCreditLedger)
      .select(
        db
          .select({
            id: sql<string>`gen_random_uuid()`.as("id"),
            tenantId: tenantCreditLedger.tenantId,
            kind: sql<string>`'scan_settle'`.as("kind"),
            amountUsd: sql<string>`-${tenantCreditLedger.amountUsd}`.as("amount_usd"),
            scanId: tenantCreditLedger.scanId,
            idempotencyKey: sql<string | null>`null`.as("idempotency_key"),
            note: sql<string>`'the scan stalled and was closed by a newer request'`.as("note"),
            createdAt: sql<Date>`now()`.as("created_at"),
          })
          .from(tenantCreditLedger)
          .where(and(eq(tenantCreditLedger.kind, "scan_hold"), inArray(tenantCreditLedger.scanId, stalled))),
      )
      .onConflictDoNothing(),
    db
      .update(scanRunnerJobs)
      .set({ state: "cancelled", finishedAt: new Date() })
      .where(and(inArray(scanRunnerJobs.scanId, stalled), inArray(scanRunnerJobs.state, ["queued", "claimed"]))),
    db.delete(scanFindings).where(inArray(scanFindings.scanId, stalled)),
    db
      .update(scans)
      .set({
        status: "failed",
        step: null,
        finishedAt: new Date(),
        error: "the scan stalled and was closed by a newer request",
        updatedAt: new Date(),
      })
      .where(and(eq(scans.repoId, repoId), stalledScansSql(nowMs))),
    db.insert(scans).values({
      id: params.scanId,
      tenantId: params.accountId,
      repo: params.repo,
      repoId,
      ref: params.ref ?? null,
      resumesScanId: params.resumesScanId ?? null,
      status: "queued",
      skill: params.options.skill,
      model: params.options.model,
      effort: params.options.effort,
      profile: params.options.profile,
      maxBudgetUsd: params.options.maxBudgetUsd.toFixed(2),
      keySource: params.keySource ?? "platform",
      createdAt: new Date(params.createdAt),
    }),
  ] as const;
};

const RESUMES_UNIQUE_CONSTRAINT = "uq_scans_resumes_scan_id";

const createErrorOf = (cause: unknown): DbError | Conflict => {
  if (pgErrorCode(cause) !== PG_UNIQUE_VIOLATION) return toDbError(cause);
  return new Conflict({
    message:
      pgErrorConstraint(cause) === RESUMES_UNIQUE_CONSTRAINT ? RESUME_ALREADY_RESUMED_MESSAGE : ACTIVE_SCAN_CONFLICT,
  });
};

const activeConflictOf =
  (db: AppDbType, repoId: string) =>
  (error: Conflict): Effect.Effect<never, DbError | Conflict> =>
    error.message === RESUME_ALREADY_RESUMED_MESSAGE
      ? Effect.fail(error)
      : Effect.tryPromise({
          try: () =>
            db
              .select({ id: scans.id })
              .from(scans)
              .where(and(eq(scans.repoId, repoId), inArray(scans.status, ["queued", "running"])))
              .limit(1),
          catch: toDbError,
        }).pipe(
          Effect.flatMap(([active]) =>
            Effect.fail(
              new Conflict({ message: active ? `${ACTIVE_SCAN_CONFLICT}: ${active.id}` : ACTIVE_SCAN_CONFLICT }),
            ),
          ),
        );

const scanWrites = (db: AppDbType, masterKey?: string): Omit<ScanRepo, "create"> => ({
  ...scanReads(db, masterKey),

  // -----
  // Insert or find the repo's record. The unique index
  // on (account, provider, host, canonical) settles a
  // race between two first scans of the same repo. The row
  // is locked until the transaction ends, so a remove of the
  // repo waits for the scan being made.
  // -----
  ensureRepo: (accountId, url, provider) =>
    Effect.tryPromise({
      try: async () => {
        const identity = repoIdentityOf(url, provider);
        await db
          .insert(scanRepos)
          .values({ tenantId: accountId, ...identity, url: displayRepoUrlOf(url, provider) })
          .onConflictDoNothing();
        const [row] = await db
          .select({ id: scanRepos.id, canonical: scanRepos.canonical, url: scanRepos.url })
          .from(scanRepos)
          .where(sameRepoIdentity(accountId, identity))
          .for("update");
        return row;
      },
      catch: toDbError,
    }),

  restoreRepo: (accountId, repoId, userId) =>
    Effect.tryPromise({
      try: async () => {
        const [row] = await db
          .select({ removedAt: scanRepos.removedAt })
          .from(scanRepos)
          .where(and(eq(scanRepos.tenantId, accountId), eq(scanRepos.id, repoId)));
        if (!row?.removedAt) return;
        if (!(await restoreRemovedRepo(db, accountId, eq(scanRepos.id, repoId))))
          throw new Conflict({ message: REPO_LIMIT_MESSAGE });
        if (userId === undefined) return;
        await insertAuditEntry(db, {
          actorPartyId: await actorPartyOf(db, userId),
          action: "repo.restored",
          subjectId: repoId,
          tenantId: accountId,
        });
      },
      catch: (cause) => (cause instanceof Conflict ? cause : toDbError(cause)),
    }),

  mark: (accountId, scanId, patch) => {
    const ended = patch.status === "succeeded" || patch.status === "failed";
    const sealedError: Effect.Effect<string | null | undefined, DbError | ExternalError> =
      patch.error === undefined || patch.error === null
        ? Effect.succeed(patch.error)
        : sealerEffect(db, masterKey, accountId).pipe(
            Effect.flatMap((sealer) =>
              Effect.tryPromise({ try: () => sealer.text(patch.error ?? ""), catch: toExternalError }),
            ),
            Effect.catchTags({
              ExternalError: () => Effect.succeed(SEAL_FAILED_ERROR),
              DbError: () => Effect.succeed(SEAL_FAILED_ERROR),
            }),
          );
    return sealedError.pipe(
      Effect.flatMap((error) =>
        Effect.tryPromise({
          try: () => {
            const update = db
              .update(scans)
              .set({
                ...(patch.status !== undefined && { status: patch.status }),
                ...(patch.step !== undefined && { step: patch.step }),
                ...(error !== undefined && { error }),
                ...(patch.commitSha !== undefined && { commitSha: patch.commitSha }),
                ...(patch.branch !== undefined && { branch: patch.branch }),
                ...(patch.resumesScanId === null && { resumesScanId: null }),
                ...(ended && { finishedAt: new Date(), step: null }),
                ...(patch.usage && {
                  inputTokens: patch.usage.inputTokens,
                  outputTokens: patch.usage.outputTokens,
                  cacheReadTokens: patch.usage.cacheReadTokens,
                  cacheWriteTokens: patch.usage.cacheWriteTokens,
                  costUsd: patch.usage.costUsd.toFixed(4),
                  phaseUsage: patch.usage.phases ?? null,
                  turns: patch.usage.turns,
                  durationMs: patch.usage.durationMs,
                }),
                updatedAt: new Date(),
              })
              .where(
                and(
                  eq(scans.tenantId, accountId),
                  eq(scans.id, scanId),
                  ne(scans.status, "stopped"),
                  patch.status === "failed" ? undefined : ne(scans.status, "failed"),
                ),
              );
            if (patch.status !== "failed") return update;
            const changed = db.$with("changed").as(update.returning({ id: scans.id }));
            const cleared = db.$with("cleared").as(
              db
                .delete(scanFindings)
                .where(inArray(scanFindings.scanId, db.select({ id: changed.id }).from(changed)))
                .returning({ id: scanFindings.id }),
            );
            return db.with(changed, cleared).select({ id: changed.id }).from(changed);
          },
          catch: toDbError,
        }),
      ),
      Effect.asVoid,
    );
  },

  addFiles: (accountId, scanId, files) =>
    files.length === 0
      ? Effect.void
      : Effect.tryPromise({
          try: () =>
            db
              .insert(scanFiles)
              .values(
                files.map((file) => ({
                  tenantId: accountId,
                  scanId,
                  name: file.name,
                  r2Key: file.r2Key,
                  sizeBytes: file.sizeBytes,
                  contentType: file.contentType,
                })),
              )
              .onConflictDoUpdate({
                target: [scanFiles.scanId, scanFiles.name],
                set: {
                  sizeBytes: sql`excluded.size_bytes`,
                  contentType: sql`excluded.content_type`,
                  r2Key: sql`excluded.r2_key`,
                },
              }),
          catch: toDbError,
        }).pipe(Effect.asVoid),

  activeSince: (accountId, nowMs) => activeScansEffect(db, accountId, nowMs, masterKey),
});

export const stopScanEffect = (
  db: AppDbType,
  accountId: string,
  scanId: string,
  now: Date,
): Effect.Effect<void, NotFound | Conflict | DbError> =>
  Effect.gen(function* () {
    const stopped = yield* Effect.tryPromise({
      try: () => {
        const ended = db.$with("ended").as(
          db
            .update(scans)
            .set({ status: "stopped", step: null, finishedAt: now, updatedAt: now })
            .where(
              and(eq(scans.tenantId, accountId), eq(scans.id, scanId), inArray(scans.status, ["queued", "running"])),
            )
            .returning({ id: scans.id }),
        );
        const cleared = db.$with("cleared").as(
          db
            .delete(scanFindings)
            .where(inArray(scanFindings.scanId, db.select({ id: ended.id }).from(ended)))
            .returning({ id: scanFindings.id }),
        );
        return db.with(ended, cleared).select({ id: ended.id }).from(ended);
      },
      catch: toDbError,
    });
    if (stopped.length === 0) {
      const [found] = yield* Effect.tryPromise({
        try: () =>
          db
            .select({ id: scans.id })
            .from(scans)
            .where(and(eq(scans.tenantId, accountId), eq(scans.id, scanId))),
        catch: toDbError,
      });
      if (!found) return yield* new NotFound({ message: "Scan not found" });
      return yield* new Conflict({ message: SCAN_ALREADY_ENDED });
    }
    yield* Effect.tryPromise({
      try: () =>
        db
          .update(scanRunnerJobs)
          .set({ state: "cancelled", finishedAt: now })
          .where(and(eq(scanRunnerJobs.scanId, scanId), inArray(scanRunnerJobs.state, ["queued", "claimed"]))),
      catch: toDbError,
    });
  });

export const stoppedUsageEffect = (
  db: AppDbType,
  accountId: string,
  scanId: string,
  usage: ScanUsage,
): Effect.Effect<void, DbError> =>
  Effect.tryPromise({
    try: () =>
      db
        .update(scans)
        .set({
          inputTokens: usage.inputTokens,
          outputTokens: usage.outputTokens,
          cacheReadTokens: usage.cacheReadTokens,
          cacheWriteTokens: usage.cacheWriteTokens,
          costUsd: usage.costUsd.toFixed(4),
          phaseUsage: usage.phases ?? null,
          turns: usage.turns,
          durationMs: usage.durationMs,
        })
        .where(and(eq(scans.tenantId, accountId), eq(scans.id, scanId), eq(scans.status, "stopped"))),
    catch: toDbError,
  }).pipe(Effect.asVoid);

// -----
// For the Workflow, on the owner connection: one batch is one
// transaction.
// -----
export const neonScanRepo = (db: DbConnectType, masterKey?: string): ScanRepo => ({
  ...scanWrites(db, masterKey),
  create: (params, repoId, nowMs) =>
    Effect.tryPromise({ try: () => db.batch(createStatements(db, params, repoId, nowMs)), catch: createErrorOf }).pipe(
      Effect.catchTag("Conflict", activeConflictOf(db, repoId)),
      Effect.asVoid,
    ),
});

// -----
// For POST /scans, inside a withTenant transaction. The writes of
// a new scan run under a savepoint, so a refused insert rolls back
// alone and the Conflict can still name the running scan.
// -----
export const tenantScanRepo = (db: AppTxDbType, masterKey?: string): ScanRepo => ({
  ...scanWrites(db, masterKey),
  create: (params, repoId, nowMs) =>
    Effect.tryPromise({
      try: () =>
        db.transaction(async (savepoint) => {
          const [settleStalled, cancelJobs, expireStalled, insertScan, ...markPrivate] = createStatements(
            savepoint,
            params,
            repoId,
            nowMs,
          );
          await settleStalled;
          await cancelJobs;
          await expireStalled;
          await insertScan;
          await Promise.all(markPrivate);
        }),
      catch: createErrorOf,
    }).pipe(Effect.catchTag("Conflict", activeConflictOf(db, repoId))),
});
