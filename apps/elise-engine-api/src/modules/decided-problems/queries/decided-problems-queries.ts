import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { Effect } from "effect";
import { scanFindings, scanFindingTriage, scanRepoBranches, scanRepos, scans } from "@repo/db-elise/schema";
import type { AppDbType } from "#/lib/db-connection";
import { toDbError, type DbError } from "#/lib/effect-query";
import { isCommitId, normalizeBranchName } from "#/modules/branches/utils";
import { repoIdentityOf, sameRepoIdentity } from "#/modules/scan-ledger";
import { SCAN_RECORDS_PROFILE_SKILL } from "#/modules/scan-records/constants";
import { DECIDED_PROBLEMS_LIMIT, DECIDED_PROBLEMS_STATUSES, OPEN_PROBLEMS_LIMIT } from "#/modules/decided-problems/constants";
import type { DecidedProblem, OpenProblem } from "#/modules/decided-problems/types";
import { repoFindingsEffect } from "#/modules/repos/queries";
import { isUnresolved, severityRank } from "#/modules/repos/utils";

export const openProblemsEffect = (
  db: AppDbType,
  tenantId: string,
  branchId: string,
  limit: number = OPEN_PROBLEMS_LIMIT,
): Effect.Effect<OpenProblem[], DbError> =>
  repoFindingsEffect(db, tenantId, branchId).pipe(
    Effect.map((byBranch) =>
      (byBranch.get(branchId) ?? [])
        .filter(isUnresolved)
        .toSorted((a, b) => severityRank(a.severity) - severityRank(b.severity))
        .slice(0, limit)
        .map(
          (finding): OpenProblem => ({
            fingerprint: finding.fingerprint,
            title: finding.title,
            class: finding.class,
            file: finding.file,
            severity: finding.severity,
          }),
        ),
    ),
  );

export const decidedBranchIdEffect = (
  db: AppDbType,
  tenantId: string,
  repoUrl: string,
  ref: string | undefined,
): Effect.Effect<string | null, DbError> =>
  Effect.tryPromise({
    try: async () => {
      if (ref !== undefined && isCommitId(ref)) return null;
      const [repo] = await db
        .select({ id: scanRepos.id, defaultBranch: scanRepos.defaultBranch })
        .from(scanRepos)
        .where(sameRepoIdentity(tenantId, repoIdentityOf(repoUrl)));
      if (repo === undefined) return null;
      const branches = await db
        .select({ id: scanRepoBranches.id, name: scanRepoBranches.name })
        .from(scanRepoBranches)
        .where(and(eq(scanRepoBranches.tenantId, tenantId), eq(scanRepoBranches.repoId, repo.id)))
        .orderBy(asc(scanRepoBranches.createdAt), asc(scanRepoBranches.name));
      const name = ref === undefined ? (repo.defaultBranch ?? branches[0]?.name ?? null) : normalizeBranchName(ref);
      return branches.find((branch) => branch.name === name)?.id ?? null;
    },
    catch: toDbError,
  });

export const decidedProblemsEffect = (
  db: AppDbType,
  tenantId: string,
  branchId: string,
  limit: number = DECIDED_PROBLEMS_LIMIT,
): Effect.Effect<DecidedProblem[], DbError> =>
  Effect.tryPromise({
    try: async () => {
      const latest = db
        .selectDistinctOn([scanFindings.fingerprint], {
          fingerprint: scanFindings.fingerprint,
          title: scanFindings.title,
          class: scanFindings.class,
          file: scanFindings.file,
          severity: scanFindings.severity,
          status: scanFindingTriage.status,
        })
        .from(scanFindings)
        .innerJoin(scans, eq(scans.id, scanFindings.scanId))
        .innerJoin(
          scanFindingTriage,
          and(
            eq(scanFindingTriage.tenantId, scans.tenantId),
            eq(scanFindingTriage.repoId, scans.repoId),
            eq(scanFindingTriage.fingerprint, scanFindings.fingerprint),
          ),
        )
        .where(
          and(
            eq(scans.tenantId, tenantId),
            eq(scans.branchId, branchId),
            eq(scans.status, "succeeded"),
            eq(scans.skill, SCAN_RECORDS_PROFILE_SKILL),
            inArray(scanFindingTriage.status, [...DECIDED_PROBLEMS_STATUSES]),
          ),
        )
        .orderBy(scanFindings.fingerprint, desc(scans.createdAt), desc(scans.id), asc(scanFindings.id))
        .as("latest");
      const rows = await db
        .select()
        .from(latest)
        .orderBy(
          sql`case ${latest.severity}
            when 'critical' then 0 when 'high' then 1 when 'medium' then 2 when 'low' then 3 when 'informational' then 4 else 5 end`,
          asc(latest.fingerprint),
        )
        .limit(limit);
      return rows.map((row): DecidedProblem => ({
        fingerprint: row.fingerprint,
        title: row.title,
        class: row.class,
        file: row.file,
        // SAFETY: the where clause above keeps only the three decided statuses.
        status: row.status as DecidedProblem["status"],
      }));
    },
    catch: toDbError,
  });
