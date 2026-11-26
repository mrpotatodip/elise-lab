import { and, desc, eq, inArray } from "drizzle-orm";
import { Effect } from "effect";
import { scanFiles, scans } from "@repo/db-elise/schema";
import type { AppDbType } from "#/lib/db-connection";
import { toDbError, type DbError } from "#/lib/effect-query";
import { SCAN_RECORDS_PROFILE_SKILL } from "#/modules/scan-records/constants";
import { PREVIOUS_MAP_ARCHITECTURE_FILE, PREVIOUS_MAP_LEDGER_FILE } from "#/modules/previous-map/constants";

export type PreviousMapKeys = { architectureKey: string; ledgerKey: string | null };

// -----
// The newest succeeded full Scan of the Branch that saved a map, and
// the R2 keys of its map and its ledger.
// -----
export const previousMapKeysEffect = (
  db: AppDbType,
  tenantId: string,
  branchId: string,
): Effect.Effect<PreviousMapKeys | null, DbError> =>
  Effect.tryPromise({
    try: async () => {
      const [newest] = await db
        .select({ scanId: scans.id })
        .from(scans)
        .innerJoin(
          scanFiles,
          and(
            eq(scanFiles.scanId, scans.id),
            eq(scanFiles.tenantId, scans.tenantId),
            eq(scanFiles.name, PREVIOUS_MAP_ARCHITECTURE_FILE),
          ),
        )
        .where(
          and(
            eq(scans.tenantId, tenantId),
            eq(scans.branchId, branchId),
            eq(scans.status, "succeeded"),
            eq(scans.skill, SCAN_RECORDS_PROFILE_SKILL),
          ),
        )
        .orderBy(desc(scans.createdAt), desc(scans.id))
        .limit(1);
      if (newest === undefined) return null;
      const files = await db
        .select({ name: scanFiles.name, r2Key: scanFiles.r2Key })
        .from(scanFiles)
        .where(
          and(
            eq(scanFiles.tenantId, tenantId),
            eq(scanFiles.scanId, newest.scanId),
            inArray(scanFiles.name, [PREVIOUS_MAP_ARCHITECTURE_FILE, PREVIOUS_MAP_LEDGER_FILE]),
          ),
        );
      const architecture = files.find((file) => file.name === PREVIOUS_MAP_ARCHITECTURE_FILE);
      if (architecture === undefined) return null;
      return {
        architectureKey: architecture.r2Key,
        ledgerKey: files.find((file) => file.name === PREVIOUS_MAP_LEDGER_FILE)?.r2Key ?? null,
      };
    },
    catch: toDbError,
  });
