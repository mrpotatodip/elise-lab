import { Effect } from "effect";
import type { AppDbType } from "#/lib/db-connection";
import { toExternalError, type DbError, type ExternalError } from "#/lib/effect-query";
import { legacyFingerprintsEffect } from "#/modules/scan-records/queries";
import type { NewFindingRow } from "#/modules/scan-records/types";
import { sealFindingText, type Sealer } from "#/modules/sealed-data";

export const sealFindingRowsSvc = (
  db: AppDbType,
  sealer: Sealer,
  tenantId: string,
  repoId: string,
  rows: readonly NewFindingRow[],
): Effect.Effect<NewFindingRow[], DbError | ExternalError> =>
  Effect.gen(function* () {
    const legacy = yield* legacyFingerprintsEffect(
      db,
      tenantId,
      repoId,
      rows.map((row) => row.fingerprint),
    );
    return yield* Effect.tryPromise({
      try: () =>
        Promise.all(
          rows.map(async (row) =>
            sealFindingText(sealer, {
              ...row,
              fingerprint: legacy.has(row.fingerprint) ? row.fingerprint : await sealer.fingerprint(row.findingId),
            }),
          ),
        ),
      catch: toExternalError,
    });
  });
