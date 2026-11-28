import { and, eq } from "drizzle-orm";
import { Effect } from "effect";
import { scanArchiveLinks, scanRepos, scanRunnerJobs, scans } from "@repo/db-elise/schema";
import type { AppDbType } from "#/lib/db-connection";
import { toDbError, type DbError } from "#/lib/effect-query";
import { PLAIN_ONLY, type Unsealer } from "#/modules/sealed-data";
import type { ResumeSource } from "#/modules/scan-ledger/types";

export const resumeSourceEffect = (
  db: AppDbType,
  accountId: string,
  scanId: string,
  unsealer: Unsealer = PLAIN_ONLY,
): Effect.Effect<ResumeSource | null, DbError> =>
  Effect.tryPromise({
    try: async () => {
      const [row] = await db
        .select({
          id: scans.id,
          status: scans.status,
          error: scans.error,
          ref: scans.ref,
          maxBudgetUsd: scans.maxBudgetUsd,
          repoUrl: scanRepos.url,
          provider: scanRepos.provider,
        })
        .from(scans)
        .innerJoin(scanRepos, and(eq(scanRepos.id, scans.repoId), eq(scanRepos.tenantId, scans.tenantId)))
        .where(and(eq(scans.tenantId, accountId), eq(scans.id, scanId)));
      if (!row) return null;
      const [job] = await db
        .select({ runnerId: scanRunnerJobs.runnerId, optionsJson: scanRunnerJobs.optionsJson })
        .from(scanRunnerJobs)
        .where(eq(scanRunnerJobs.scanId, scanId));
      const [resumedBy] = await db
        .select({ id: scans.id })
        .from(scans)
        .where(and(eq(scans.tenantId, accountId), eq(scans.resumesScanId, scanId)));
      const [archive] = await db
        .select({ archiveId: scanArchiveLinks.archiveId })
        .from(scanArchiveLinks)
        .where(eq(scanArchiveLinks.scanId, scanId));
      return {
        ...row,
        error: await unsealer.textOrNull(row.error),
        maxBudgetUsd: Number(row.maxBudgetUsd),
        job: job ? { ...job, optionsJson: await unsealer.text(job.optionsJson) } : null,
        resumedByScanId: resumedBy?.id ?? null,
        archive: archive ?? null,
      };
    },
    catch: toDbError,
  });
