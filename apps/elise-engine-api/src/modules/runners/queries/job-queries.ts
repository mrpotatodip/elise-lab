import { and, asc, eq, inArray, isNotNull, isNull, notExists, sql } from "drizzle-orm";
import { Effect } from "effect";
import type { RunnerJobSourceValue } from "@repo/contracts/elise";
import { scanArchiveLinks, scanRunnerJobs, scans, tenantRunners, type TScanRunnerJob } from "@repo/db-elise";
import type { AppDbType, DbConnectType } from "#/lib/db-connection";
import { toDbError, type DbError } from "#/lib/effect-query";
import type { JobReport, NewRunnerJob } from "#/modules/runners/types";

// -----
// The Workflow queues the job. A retried launch writes it again,
// so the same Scan never has two. The row is written by one
// INSERT ... SELECT that finds the Scan not stopped, so a Stop
// that lands first leaves no job behind.
// -----
export const insertRunnerJobEffect = (db: DbConnectType, job: NewRunnerJob): Effect.Effect<void, DbError> =>
  Effect.tryPromise({
    try: () =>
      db.execute(sql`
        insert into scan_runner_jobs (scan_id, tenant_id, runner_id, repo_url, ref, prompt, options_json, priors_json, resumes_scan_id)
        select ${job.scanId}, ${job.tenantId}::uuid, ${job.runnerId}::uuid, ${job.repoUrl}, ${job.ref}, ${job.prompt}, ${job.optionsJson}, ${job.priorsJson}, ${job.resumesScanId}
        from scans
        where id = ${job.scanId} and status <> 'stopped'
        on conflict do nothing
      `),
    catch: toDbError,
  }).pipe(Effect.asVoid);

const EARLIER_SCANS_MAX = 50;

export const earlierScanIdsEffect = (
  db: DbConnectType,
  tenantId: string,
  resumesScanId: string,
): Effect.Effect<string[], DbError> =>
  Effect.tryPromise({
    try: async () => {
      const found: string[] = [];
      let next: string | null = resumesScanId;
      while (next !== null && !found.includes(next) && found.length < EARLIER_SCANS_MAX) {
        found.push(next);
        const [row] = await db
          .select({ resumes: scans.resumesScanId })
          .from(scans)
          .where(and(eq(scans.tenantId, tenantId), eq(scans.id, next)));
        next = row?.resumes ?? null;
      }
      return found;
    },
    catch: toDbError,
  });

export const scanStoppedEffect = (db: DbConnectType, scanId: string): Effect.Effect<boolean, DbError> =>
  Effect.tryPromise({
    try: () => db.select({ status: scans.status }).from(scans).where(eq(scans.id, scanId)),
    catch: toDbError,
  }).pipe(Effect.map(([row]) => row?.status === "stopped"));

// -----
// The Runner takes its oldest queued job in one UPDATE. The state
// is checked again in the UPDATE itself, so a job is never claimed
// twice. The pick skips a row another claim has locked, so two
// claims at once take two jobs instead of one taking its job and
// the other getting nothing. The pick is compared with = (one
// value, read once): with IN, Postgres may read it again for every
// row and one claim would take every queued job. A Runner that does
// not read archives skips the jobs of upload Scans (those with a
// link to a zip): they wait for a Runner that does, or time out.
// Null when nothing is waiting.
// -----
export const claimRunnerJobEffect = (
  db: DbConnectType,
  runnerId: string,
  now: Date,
  readsArchive = false,
): Effect.Effect<TScanRunnerJob | null, DbError> =>
  Effect.tryPromise({
    try: () => {
      const readable = readsArchive
        ? undefined
        : notExists(
            db
              .select({ scanId: scanArchiveLinks.scanId })
              .from(scanArchiveLinks)
              .where(eq(scanArchiveLinks.scanId, scanRunnerJobs.scanId)),
          );
      const stillWanted = notExists(
        db
          .select({ id: scans.id })
          .from(scans)
          .where(and(eq(scans.id, scanRunnerJobs.scanId), eq(scans.status, "stopped"))),
      );
      const next = db
        .select({ scanId: scanRunnerJobs.scanId })
        .from(scanRunnerJobs)
        .where(and(eq(scanRunnerJobs.runnerId, runnerId), eq(scanRunnerJobs.state, "queued"), readable, stillWanted))
        .orderBy(asc(scanRunnerJobs.createdAt))
        .limit(1)
        .for("update", { skipLocked: true });
      return db
        .update(scanRunnerJobs)
        .set({ state: "claimed", claimedAt: now })
        .where(and(eq(scanRunnerJobs.scanId, next), eq(scanRunnerJobs.state, "queued")))
        .returning();
    },
    catch: toDbError,
  }).pipe(Effect.map(([row]) => row ?? null));

export const releaseRunnerJobEffect = (db: DbConnectType, scanId: string): Effect.Effect<void, DbError> =>
  Effect.tryPromise({
    try: () =>
      db
        .update(scanRunnerJobs)
        .set({ state: "queued", claimedAt: null })
        .where(and(eq(scanRunnerJobs.scanId, scanId), eq(scanRunnerJobs.state, "claimed"))),
    catch: toDbError,
  }).pipe(Effect.asVoid);

// -----
// The Runner's report. It counts only while the job is claimed by
// this Runner: a Scan that already ended (cancelled) refuses it.
// -----
export const reportRunnerJobEffect = (db: DbConnectType, report: JobReport): Effect.Effect<boolean, DbError> =>
  Effect.tryPromise({
    try: () =>
      db
        .update(scanRunnerJobs)
        .set({
          state: report.state,
          error: report.error,
          commitSha: report.commitSha,
          branch: report.branch,
          usageJson: report.usageJson,
          filesJson: report.filesJson,
          finishedAt: report.now,
        })
        .where(
          and(
            eq(scanRunnerJobs.scanId, report.scanId),
            eq(scanRunnerJobs.runnerId, report.runnerId),
            eq(scanRunnerJobs.state, "claimed"),
          ),
        )
        .returning({ scanId: scanRunnerJobs.scanId }),
    catch: toDbError,
  }).pipe(Effect.map((rows) => rows.length > 0));

export const readRunnerJobEffect = (db: DbConnectType, scanId: string): Effect.Effect<TScanRunnerJob | null, DbError> =>
  Effect.tryPromise({
    try: () => db.select().from(scanRunnerJobs).where(eq(scanRunnerJobs.scanId, scanId)),
    catch: toDbError,
  }).pipe(Effect.map(([row]) => row ?? null));

// -----
// The Scan ended before the Runner reported (it timed out, or
// failed some other way): a late report is refused.
// -----
export const cancelRunnerJobEffect = (db: DbConnectType, scanId: string, now: Date): Effect.Effect<void, DbError> =>
  Effect.tryPromise({
    try: () =>
      db
        .update(scanRunnerJobs)
        .set({ state: "cancelled", finishedAt: now })
        .where(and(eq(scanRunnerJobs.scanId, scanId), inArray(scanRunnerJobs.state, ["queued", "claimed"]))),
    catch: toDbError,
  }).pipe(Effect.asVoid);

// -----
// The job sources the Runner reported in its claim, written only
// when they changed, so a poll every few seconds writes nothing.
// -----
export const recordRunnerSourcesEffect = (
  db: DbConnectType,
  runnerId: string,
  sources: RunnerJobSourceValue[],
): Effect.Effect<void, DbError> =>
  Effect.tryPromise({
    try: () =>
      db
        .update(tenantRunners)
        .set({ jobSources: sources })
        .where(
          and(
            eq(tenantRunners.id, runnerId),
            sql`${tenantRunners.jobSources} is distinct from array[${sql.join(
              sources.map((source) => sql`${source}`),
              sql`, `,
            )}]::text[]`,
          ),
        ),
    catch: toDbError,
  }).pipe(Effect.asVoid);

// -----
// A Runner of the Account that has paired and is not removed: the
// job sources it last reported, or null when there is no such
// Runner.
// -----
export const findConnectedRunnerEffect = (
  db: AppDbType,
  tenantId: string,
  runnerId: string,
): Effect.Effect<string[] | null, DbError> =>
  Effect.tryPromise({
    try: () =>
      db
        .select({ jobSources: tenantRunners.jobSources })
        .from(tenantRunners)
        .where(
          and(
            eq(tenantRunners.id, runnerId),
            eq(tenantRunners.tenantId, tenantId),
            isNotNull(tenantRunners.tokenHash),
            isNull(tenantRunners.revokedAt),
          ),
        ),
    catch: toDbError,
  }).pipe(Effect.map(([row]) => row?.jobSources ?? null));
