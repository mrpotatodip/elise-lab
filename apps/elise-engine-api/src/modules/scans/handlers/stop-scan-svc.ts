import { Effect } from "effect";
import { NotFound, type Conflict, type DbError } from "#/lib/effect-query";
import type { AppDbType } from "#/lib/db-connection";
import type { ScanStatus } from "#/schemas";
import { scanReads, stopScanEffect } from "#/modules/scan-ledger";

export const stopScanSvc = (db: AppDbType, accountId: string, scanId: string, now: Date): Effect.Effect<ScanStatus, NotFound | Conflict | DbError> =>
  Effect.gen(function* () {
    yield* stopScanEffect(db, accountId, scanId, now);
    const stopped = yield* scanReads(db).get(accountId, scanId);
    if (!stopped) return yield* new NotFound({ message: "Scan not found" });
    return stopped;
  });
