import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { Effect } from "effect";
import { VERDICT_SCAN_WEIGHTS } from "@repo/contracts/elise";
import { scanFindings, scanFindingTriage, scans } from "@repo/db-elise/schema";
import type { AppDbType } from "#/lib/db-connection";
import { toDbError, type DbError } from "#/lib/effect-query";
import { VERDICT_SCAN_FETCH_LIMIT } from "#/modules/verdict/constants";
import type { JudgedFinding, JudgedScan, JudgedTriage } from "#/modules/verdict/types";

type CommitEvidence = { scans: JudgedScan[]; findings: JudgedFinding[]; triage: JudgedTriage[] };

const WEIGHED_PROFILES = Object.entries(VERDICT_SCAN_WEIGHTS)
  .filter(([name, weight]) => name !== "lite" && weight > 0)
  .map(([name]) => name);

// -----
// The Scans that scanWeight gives a weight, as SQL, for a query
// that must pick them in the database: an old lite Scan, or a
// Scan that is not partial and met (or, with no Profile check,
// asked for) a profile that weighs. A Partial Scan, a Scan that
// met no profile and an older full Scan whose findings were
// never recorded (partial is null) are left out.
// -----
export const weighedScanWhere = or(
  VERDICT_SCAN_WEIGHTS.lite > 0 ? eq(scans.skill, "lite") : undefined,
  and(eq(scans.partial, false), inArray(sql`coalesce(${scans.profileMet}, ${scans.profile})`, WEIGHED_PROFILES)),
);

// -----
// What the verdict reads: the newest succeeded scans of one
// commit of one repo, whatever their Skill (a scan of a ref
// counts too, because the verdict is about the commit, not the
// branch), their findings, and the decisions people made about
// the repo. The History is not read.
// -----
export const commitEvidenceEffect = (db: AppDbType, tenantId: string, repoId: string, commit: string): Effect.Effect<CommitEvidence, DbError> =>
  Effect.tryPromise({
    try: async () => {
      const scanRows = await db
        .select({ id: scans.id, createdAt: scans.createdAt, skill: scans.skill, profile: scans.profile, partial: scans.partial, profileMet: scans.profileMet, priorsGiven: scans.priorsGiven, priorsUnchecked: scans.priorsUnchecked })
        .from(scans)
        .where(and(eq(scans.tenantId, tenantId), eq(scans.repoId, repoId), eq(scans.commitSha, commit), eq(scans.status, "succeeded")))
        .orderBy(desc(scans.createdAt))
        .limit(VERDICT_SCAN_FETCH_LIMIT);
      if (scanRows.length === 0) return { scans: [], findings: [], triage: [] };

      const findings = await db
        .select({
          scanId: scanFindings.scanId,
          fingerprint: scanFindings.fingerprint,
          title: scanFindings.title,
          severity: scanFindings.severity,
          class: scanFindings.class,
          file: scanFindings.file,
          line: scanFindings.line,
          impact: scanFindings.impact,
          evidence: scanFindings.evidence,
          fix: scanFindings.fix,
          needs: scanFindings.needs,
        })
        .from(scanFindings)
        .where(
          and(
            eq(scanFindings.tenantId, tenantId),
            inArray(
              scanFindings.scanId,
              scanRows.map((row) => row.id),
            ),
          ),
        );
      const triage = await db
        .select({ fingerprint: scanFindingTriage.fingerprint, status: scanFindingTriage.status, note: scanFindingTriage.note, acceptedUntil: scanFindingTriage.acceptedUntil, duplicateOf: scanFindingTriage.duplicateOf })
        .from(scanFindingTriage)
        .where(and(eq(scanFindingTriage.tenantId, tenantId), eq(scanFindingTriage.repoId, repoId)));
      return { scans: scanRows, findings, triage };
    },
    catch: toDbError,
  });
