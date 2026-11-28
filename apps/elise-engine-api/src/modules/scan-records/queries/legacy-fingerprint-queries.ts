import { and, eq, inArray } from "drizzle-orm";
import { Effect } from "effect";
import { scanFindings, scans } from "@repo/db-elise/schema";
import type { AppDbType } from "#/lib/db-connection";
import { toDbError, type DbError } from "#/lib/effect-query";

export const legacyFingerprintsEffect = (
  db: AppDbType,
  tenantId: string,
  repoId: string,
  candidates: readonly string[],
): Effect.Effect<Set<string>, DbError> =>
  candidates.length === 0
    ? Effect.succeed(new Set<string>())
    : Effect.tryPromise({
        try: () =>
          db
            .selectDistinct({ fingerprint: scanFindings.fingerprint })
            .from(scanFindings)
            .innerJoin(scans, eq(scans.id, scanFindings.scanId))
            .where(
              and(
                eq(scanFindings.tenantId, tenantId),
                eq(scans.repoId, repoId),
                inArray(scanFindings.fingerprint, [...candidates]),
              ),
            )
            .then((rows) => new Set(rows.map((row) => row.fingerprint))),
        catch: toDbError,
      });
