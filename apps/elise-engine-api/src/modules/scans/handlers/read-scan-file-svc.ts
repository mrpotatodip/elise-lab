import { Effect } from "effect";
import { NotFound, type DbError, type ExternalError } from "#/lib/effect-query";
import type { ScanReads } from "#/modules/scan-ledger";
import { readScanFileEffect, scanPrefix } from "#/modules/scan-store";
import { CANNOT_READ, PLAIN_ONLY, type Unsealer } from "#/modules/sealed-data";

// -----
// Neon decides whether the file exists for this
// account; R2 only supplies the bytes. A key outside the
// account's prefix is never read, whatever the row says.
// A sealed file is opened for the Account; one that will not
// open says "cannot be read" and never sends the sealed bytes.
// -----
export const readScanFileSvc = (
  reports: R2Bucket,
  repo: ScanReads,
  accountId: string,
  scanId: string,
  file: string,
  unsealer: Unsealer = PLAIN_ONLY,
): Effect.Effect<
  { body: ReadableStream | ArrayBuffer | string; contentType: string },
  NotFound | DbError | ExternalError
> =>
  Effect.gen(function* () {
    const ref = yield* repo.file(accountId, scanId, file);
    if (!ref || !ref.r2Key.startsWith(scanPrefix(accountId))) return yield* new NotFound({ message: "File not found" });
    const stored = yield* readScanFileEffect(reports, ref.r2Key);
    if (!stored) return yield* new NotFound({ message: "File not found" });
    const body = yield* Effect.promise(() => unsealer.object(stored));
    return { body: body ?? CANNOT_READ, contentType: ref.contentType };
  });
