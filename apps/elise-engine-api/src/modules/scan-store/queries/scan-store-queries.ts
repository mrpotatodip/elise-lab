import { Effect } from "effect";
import { toExternalError, type ExternalError } from "#/lib/effect-query";
import type { ScanFiles } from "#/lib/scan-file-types";
import type { NewScanFile } from "#/modules/scan-ledger";
import { SEALED_OBJECT_METADATA, type Sealer } from "#/modules/sealed-data";
import { scanFileContentType, scanKey } from "#/modules/scan-store/utils";

// -----
// R2 holds only the bytes, sealed with the Account's Data key
// (size is the plain size). The caller records each returned
// file in Neon (scan_files) so every object can be traced to
// its scan and account.
// -----
export const saveScanFilesEffect = (
  reports: R2Bucket,
  sealer: Sealer,
  accountId: string,
  scanId: string,
  files: ScanFiles,
): Effect.Effect<NewScanFile[], ExternalError> => {
  const saved = Object.entries(files).map(([name, content]) => ({
    name,
    content,
    r2Key: scanKey(accountId, scanId, name),
    sizeBytes: new TextEncoder().encode(content).length,
    contentType: scanFileContentType(name),
  }));
  return Effect.all(
    saved.map((file) =>
      Effect.tryPromise({
        try: async () =>
          reports.put(file.r2Key, await sealer.bytes(new TextEncoder().encode(file.content)), {
            customMetadata: SEALED_OBJECT_METADATA,
          }),
        catch: toExternalError,
      }),
    ),
    { concurrency: "unbounded" },
  ).pipe(Effect.as(saved.map(({ name, r2Key, sizeBytes, contentType }) => ({ name, r2Key, sizeBytes, contentType }))));
};

export const readScanFileEffect = (
  reports: R2Bucket,
  r2Key: string,
): Effect.Effect<R2ObjectBody | null, ExternalError> =>
  Effect.tryPromise({ try: () => reports.get(r2Key), catch: toExternalError });
