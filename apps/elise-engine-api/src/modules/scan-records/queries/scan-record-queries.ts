import { and, eq } from "drizzle-orm";
import { Effect } from "effect";
import type { ScanStateValue } from "@repo/contracts/elise";
import { scanFindings, scans } from "@repo/db-elise/schema";
import { toDbError, type DbError } from "#/lib/effect-query";
import type { DbConnectType } from "#/lib/db-connection";
import type { ScanRecord } from "#/modules/scan-records/types";

// -----
// The repo a scan belongs to, the branch it read and the state
// it is in now, from the scans row made when it was queued.
// -----
export type ScanRowOf = { repoId: string; status: ScanStateValue; branch: string | null; ref: string | null };

export const scanRowOfEffect = (
  db: DbConnectType,
  tenantId: string,
  scanId: string,
): Effect.Effect<ScanRowOf, DbError> =>
  Effect.tryPromise({
    try: async () => {
      const [row] = await db
        .select({ repoId: scans.repoId, status: scans.status, branch: scans.branch, ref: scans.ref })
        .from(scans)
        .where(and(eq(scans.tenantId, tenantId), eq(scans.id, scanId)));
      if (!row) throw new Error(`scan ${scanId} has no row to take its repo from`);
      return row;
    },
    catch: toDbError,
  });

export const writeScanRecordEffect = (db: DbConnectType, record: ScanRecord): Effect.Effect<void, DbError> =>
  Effect.tryPromise({
    try: async () => {
      const { scan, findings: rows } = record;
      const upsert = db
        .insert(scans)
        .values(scan)
        .onConflictDoUpdate({
          target: scans.id,
          set: {
            status: scan.status,
            error: scan.error,
            branch: scan.branch,
            branchId: scan.branchId,
            untrackedReason: scan.untrackedReason,
            finishedAt: scan.finishedAt,
            partial: scan.partial,
            profileMet: scan.profileMet,
            inputTokens: scan.inputTokens,
            outputTokens: scan.outputTokens,
            cacheReadTokens: scan.cacheReadTokens,
            cacheWriteTokens: scan.cacheWriteTokens,
            costUsd: scan.costUsd,
            phaseUsage: scan.phaseUsage,
            openProblemChecks: scan.openProblemChecks,
            turns: scan.turns,
            durationMs: scan.durationMs,
            recordedAt: new Date(),
          },
        });
      const clear = db.delete(scanFindings).where(eq(scanFindings.scanId, scan.id));
      // -----
      // One batch is one transaction: the scan and its findings
      // change together or not at all.
      // -----
      const insertFindings = rows.length === 0 ? [] : [db.insert(scanFindings).values(rows)];
      await db.batch([upsert, clear, ...insertFindings]);
    },
    catch: toDbError,
  });
