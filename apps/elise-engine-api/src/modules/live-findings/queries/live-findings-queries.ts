import { and, eq, inArray } from "drizzle-orm";
import { Effect } from "effect";
import type { ScanStateValue } from "@repo/contracts/elise";
import { scanFindings, scans } from "@repo/db-elise/schema";
import type { AppDbType } from "#/lib/db-connection";
import { toDbError, type DbError } from "#/lib/effect-query";
import type { NewFindingRow } from "#/modules/scan-records/types";

export const lockScanStatusEffect = (
  db: AppDbType,
  tenantId: string,
  scanId: string,
): Effect.Effect<{ status: ScanStateValue; repoId: string } | null, DbError> =>
  Effect.tryPromise({
    try: () =>
      db
        .select({ status: scans.status, repoId: scans.repoId })
        .from(scans)
        .where(and(eq(scans.tenantId, tenantId), eq(scans.id, scanId)))
        .for("update")
        .then(([row]) => row ?? null),
    catch: toDbError,
  });

export const liveFindingIdsEffect = (
  db: AppDbType,
  scanId: string,
): Effect.Effect<{ id: string; fingerprint: string }[], DbError> =>
  Effect.tryPromise({
    try: () =>
      db
        .select({ id: scanFindings.id, fingerprint: scanFindings.fingerprint })
        .from(scanFindings)
        .where(eq(scanFindings.scanId, scanId)),
    catch: toDbError,
  });

export const replaceLiveFindingsEffect = (
  db: AppDbType,
  replacedIds: readonly string[],
  rows: readonly NewFindingRow[],
): Effect.Effect<void, DbError> =>
  Effect.tryPromise({
    try: async () => {
      if (replacedIds.length > 0) await db.delete(scanFindings).where(inArray(scanFindings.id, [...replacedIds]));
      if (rows.length > 0) await db.insert(scanFindings).values([...rows]);
    },
    catch: toDbError,
  });
