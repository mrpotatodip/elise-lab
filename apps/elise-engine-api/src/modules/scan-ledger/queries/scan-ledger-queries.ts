import { and, asc, eq, gt, inArray, ne, notExists, sql } from "drizzle-orm";
import { Effect } from "effect";
import { scanFiles, scanFindings, scanRepos, scanRunnerJobs, scans, tenantCreditLedger, tenantRunners } from "@repo/db-elise/schema";
import type { AppDbType, AppTxDbType, DbConnectType } from "#/lib/db-connection";
import { Conflict, toDbError, type DbError } from "#/lib/effect-query";
import { PG_UNIQUE_VIOLATION, pgErrorCode } from "#/lib/pg-error";
import type { ScanParams, ScanStatus } from "#/schemas";
import type { ActiveCounts, ScanPage, ScanReads, ScanRepo } from "#/modules/scan-ledger/types";
import { canonicalRepo, displayRepoUrl, liveScansSql, scanRowToStatus, stalledScansSql, summaryOf } from "#/modules/scan-ledger/utils";

type ScanRow = typeof scans.$inferSelect;

const ACTIVE_SCAN_CONFLICT = "This repo already has an active scan";

// -----
// The Runner each of these scans is on, from its job row. A scan
// has a job row once its Workflow has queued the job, a few seconds
// after it starts.
// -----
const runnersOf = (db: AppDbType, ids: string[]) =>
  Effect.tryPromise({
    try: () =>
      db
        .select({ scanId: scanRunnerJobs.scanId, id: tenantRunners.id, name: tenantRunners.name })
        .from(scanRunnerJobs)
        .innerJoin(tenantRunners, eq(tenantRunners.id, scanRunnerJobs.runnerId))
        .where(inArray(scanRunnerJobs.scanId, ids)),
    catch: toDbError,
  });

// -----
// An Account's live scans. Callers count these scans and add up
// their budget caps, so the rows come back with no files and no
// finding counts: a queued or running scan has no summary, and two
// more queries on the path of every new scan would buy nothing.
// They do carry their Runner, because a scan on a Runner is counted
// apart from one in our cloud.
// -----
export const activeScansEffect = (db: AppDbType, accountId: string, nowMs: number): Effect.Effect<ScanStatus[], DbError> =>
  Effect.gen(function* () {
    const rows = yield* Effect.tryPromise({
      try: () => db.select().from(scans).where(and(eq(scans.tenantId, accountId), liveScansSql(nowMs))),
      catch: toDbError,
    });
    const runners = rows.length === 0 ? [] : yield* runnersOf(db, rows.map((row) => row.id));
    return rows.map((row) => scanRowToStatus(row, [], null, runners.find((runner) => runner.scanId === row.id) ?? null));
  });

// -----
// The rows with their files, the Runner a scan ran on and, for a
// scan whose findings are recorded, the counts of what it found.
// -----
const withFiles = (db: AppDbType, rows: ScanRow[]): Effect.Effect<ScanStatus[], DbError> =>
  rows.length === 0
    ? Effect.succeed([])
    : Effect.gen(function* () {
        const ids = rows.map((row) => row.id);
        const files = yield* Effect.tryPromise({
          try: () =>
            db
              .select({ scanId: scanFiles.scanId, name: scanFiles.name, sizeBytes: scanFiles.sizeBytes, contentType: scanFiles.contentType })
              .from(scanFiles)
              .where(inArray(scanFiles.scanId, ids))
              .orderBy(asc(scanFiles.name)),
          catch: toDbError,
        });
        const counts = yield* Effect.tryPromise({
          try: () =>
            db
              .select({ scanId: scanFindings.scanId, status: scanFindings.status, severity: scanFindings.severity, origin: scanFindings.origin, total: sql<number>`count(*)::int` })
              .from(scanFindings)
              .where(inArray(scanFindings.scanId, ids))
              .groupBy(scanFindings.scanId, scanFindings.status, scanFindings.severity, scanFindings.origin),
          catch: toDbError,
        });
        const runners = yield* runnersOf(db, ids);
        return rows.map((row) =>
          scanRowToStatus(
            row,
            files.filter((file) => file.scanId === row.id).map(({ name, sizeBytes, contentType }) => ({ name, sizeBytes, contentType })),
            summaryOf(row, counts.filter((count) => count.scanId === row.id)),
            runners.find((runner) => runner.scanId === row.id) ?? null,
          ),
        );
      });

// -----
// The reads a route makes, on any client: the owner
// connection, or a withTenant transaction that holds them
// to one Account. A scan id starts with an inverted
// timestamp, so ascending ids are newest first and an id
// is a cursor.
// -----
export const scanReads = (db: AppDbType): ScanReads => ({
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
        withFiles(db, rows.slice(0, limit)).pipe(
          Effect.map((page) => ({ scans: page, nextCursor: rows.length > limit ? rows[limit - 1].id : null })),
        ),
      ),
    ),

  get: (accountId, scanId) =>
    Effect.tryPromise({
      try: () => db.select().from(scans).where(and(eq(scans.tenantId, accountId), eq(scans.id, scanId))),
      catch: toDbError,
    }).pipe(
      Effect.flatMap((rows) => withFiles(db, rows)),
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
  const stalled = db.select({ id: scans.id }).from(scans).where(and(eq(scans.repoId, repoId), stalledScansSql(nowMs)));
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
    db
      .update(scans)
      .set({ status: "failed", step: null, finishedAt: new Date(), error: "the scan stalled and was closed by a newer request", updatedAt: new Date() })
      .where(and(eq(scans.repoId, repoId), stalledScansSql(nowMs))),
    db.insert(scans).values({
      id: params.scanId,
      tenantId: params.accountId,
      repo: params.repo,
      repoId,
      ref: params.ref ?? null,
      status: "queued",
      skill: params.options.skill,
      model: params.options.model,
      effort: params.options.effort,
      profile: params.options.profile,
      maxBudgetUsd: params.options.maxBudgetUsd.toFixed(2),
      keySource: params.keySource ?? "platform",
      installationId: params.github?.installationRowId ?? null,
      githubRepoId: params.github?.repoId ?? null,
      isPrivate: params.github?.isPrivate ?? null,
      createdAt: new Date(params.createdAt),
    }),
    ...(params.github ? [db.update(scanRepos).set({ isPrivate: params.github.isPrivate }).where(eq(scanRepos.id, repoId))] : []),
  ] as const;
};

const createErrorOf = (cause: unknown): DbError | Conflict => (pgErrorCode(cause) === PG_UNIQUE_VIOLATION ? new Conflict({ message: ACTIVE_SCAN_CONFLICT }) : toDbError(cause));

const activeConflictOf = (db: AppDbType, repoId: string) => (): Effect.Effect<never, DbError | Conflict> =>
  Effect.tryPromise({
    try: () => db.select({ id: scans.id }).from(scans).where(and(eq(scans.repoId, repoId), inArray(scans.status, ["queued", "running"]))).limit(1),
    catch: toDbError,
  }).pipe(Effect.flatMap(([active]) => Effect.fail(new Conflict({ message: active ? `${ACTIVE_SCAN_CONFLICT}: ${active.id}` : ACTIVE_SCAN_CONFLICT }))));

const scanWrites = (db: AppDbType): Omit<ScanRepo, "create" | "activeCounts"> => ({
  ...scanReads(db),

  // -----
  // Insert or find the repo's record. The unique index
  // on (account, canonical) settles a race between two
  // first scans of the same repo.
  // -----
  ensureRepo: (accountId, url) =>
    Effect.tryPromise({
      try: async () => {
        const canonical = canonicalRepo(url);
        await db.insert(scanRepos).values({ tenantId: accountId, canonical, url: displayRepoUrl(url) }).onConflictDoNothing();
        const [row] = await db
          .select({ id: scanRepos.id, canonical: scanRepos.canonical, url: scanRepos.url })
          .from(scanRepos)
          .where(and(eq(scanRepos.tenantId, accountId), eq(scanRepos.canonical, canonical)));
        return row;
      },
      catch: toDbError,
    }),

  mark: (accountId, scanId, patch) => {
    const ended = patch.status === "succeeded" || patch.status === "failed";
    return Effect.tryPromise({
      try: () =>
        db
          .update(scans)
          .set({
            ...(patch.status !== undefined && { status: patch.status }),
            ...(patch.step !== undefined && { step: patch.step }),
            ...(patch.error !== undefined && { error: patch.error }),
            ...(patch.commitSha !== undefined && { commitSha: patch.commitSha }),
            ...(patch.branch !== undefined && { branch: patch.branch }),
            ...(ended && { finishedAt: new Date(), step: null }),
            ...(patch.usage && {
              inputTokens: patch.usage.inputTokens,
              outputTokens: patch.usage.outputTokens,
              cacheReadTokens: patch.usage.cacheReadTokens,
              cacheWriteTokens: patch.usage.cacheWriteTokens,
              costUsd: patch.usage.costUsd.toFixed(4),
              turns: patch.usage.turns,
              durationMs: patch.usage.durationMs,
            }),
            updatedAt: new Date(),
          })
          .where(and(eq(scans.tenantId, accountId), eq(scans.id, scanId), patch.status === "failed" ? undefined : ne(scans.status, "failed"))),
      catch: toDbError,
    }).pipe(Effect.asVoid);
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
                set: { sizeBytes: sql`excluded.size_bytes`, contentType: sql`excluded.content_type`, r2Key: sql`excluded.r2_key` },
              }),
          catch: toDbError,
        }).pipe(Effect.asVoid),

  activeSince: (accountId, nowMs) => activeScansEffect(db, accountId, nowMs),
});

// -----
// How many live scans each path holds, over every Account. It is
// the global cap's count, so it is the one read here that crosses
// Accounts, and it returns counts only: it runs on the owner role,
// since a withTenant transaction sees one Account's scans. A scan
// on a Runner runs on the person's computer and holds no Sandbox
// of ours, so it is left out.
// -----
export const activeCountsEffect = (db: DbConnectType, nowMs: number): Effect.Effect<ActiveCounts, DbError> =>
  Effect.tryPromise({
    try: () =>
      db
        .select({ skill: scans.skill, total: sql<string>`count(*)` })
        .from(scans)
        .where(and(liveScansSql(nowMs), notExists(db.select({ one: sql`1` }).from(scanRunnerJobs).where(eq(scanRunnerJobs.scanId, scans.id)))))
        .groupBy(scans.skill),
    catch: toDbError,
  }).pipe(
    Effect.map((rows) => ({
      lite: rows.filter((row) => row.skill !== "full").reduce((sum, row) => sum + Number(row.total), 0),
      full: rows.filter((row) => row.skill === "full").reduce((sum, row) => sum + Number(row.total), 0),
    })),
  );

// -----
// For the Workflow, on the owner connection: one batch is one
// transaction.
// -----
export const neonScanRepo = (db: DbConnectType): ScanRepo => ({
  ...scanWrites(db),
  create: (params, repoId, nowMs) =>
    Effect.tryPromise({ try: () => db.batch(createStatements(db, params, repoId, nowMs)), catch: createErrorOf }).pipe(
      Effect.catchTag("Conflict", activeConflictOf(db, repoId)),
      Effect.asVoid,
    ),
  activeCounts: (nowMs) => activeCountsEffect(db, nowMs),
});

// -----
// For POST /scans, inside a withTenant transaction. The writes of
// a new scan run under a savepoint, so a refused insert rolls back
// alone and the Conflict can still name the running scan. The
// global count crosses Accounts, which the transaction cannot see,
// so the caller hands it in.
// -----
export const tenantScanRepo = (db: AppTxDbType, activeCounts: ScanRepo["activeCounts"]): ScanRepo => ({
  ...scanWrites(db),
  activeCounts,
  create: (params, repoId, nowMs) =>
    Effect.tryPromise({
      try: () =>
        db.transaction(async (savepoint) => {
          const [settleStalled, cancelJobs, expireStalled, insertScan, ...markPrivate] = createStatements(savepoint, params, repoId, nowMs);
          await settleStalled;
          await cancelJobs;
          await expireStalled;
          await insertScan;
          await Promise.all(markPrivate);
        }),
      catch: createErrorOf,
    }).pipe(Effect.catchTag("Conflict", activeConflictOf(db, repoId))),
});
