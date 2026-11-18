import { Effect } from "effect";
import type { UploadArchive, UploadArchiveList, UploadArchiveRemoved } from "@repo/contracts/elise";
import type { AppDbType } from "#/lib/db-connection";
import { Invalid, toExternalError, type DbError, type ExternalError, type NotFound } from "#/lib/effect-query";
import { deleteArchiveEffect, findUploadAppEffect, insertArchiveEffect, listArchivesEffect } from "#/modules/archives/queries";
import { archiveKeyOf, isZip, sha256HexOf } from "#/modules/archives/utils";

export const NOT_A_ZIP = "The file is not a zip";

export const listArchivesSvc = (db: AppDbType, accountId: string, repoId: string): Effect.Effect<UploadArchiveList, NotFound | DbError> =>
  findUploadAppEffect(db, accountId, repoId).pipe(
    Effect.flatMap(() => listArchivesEffect(db, accountId, repoId)),
    Effect.map((archives) => ({ archives })),
  );

// -----
// One zip under an app. The row is written first and the bytes
// second, in the caller's transaction: if R2 refuses them, the
// row rolls back, so no object is ever stored without its row.
// -----
export const uploadArchiveSvc = (
  db: AppDbType,
  reports: R2Bucket,
  accountId: string,
  repoId: string,
  label: string,
  bytes: ArrayBuffer,
): Effect.Effect<UploadArchive, Invalid | NotFound | DbError | ExternalError> =>
  Effect.gen(function* () {
    yield* findUploadAppEffect(db, accountId, repoId);
    if (!isZip(new Uint8Array(bytes))) return yield* new Invalid({ message: NOT_A_ZIP });
    const contentSha256 = yield* Effect.tryPromise({ try: () => sha256HexOf(bytes), catch: toExternalError });
    const id = crypto.randomUUID();
    const r2Key = archiveKeyOf(accountId, repoId, id);
    const archive = yield* insertArchiveEffect(db, { id, tenantId: accountId, repoId, label, r2Key, sizeBytes: bytes.byteLength, contentSha256 });
    yield* Effect.tryPromise({ try: () => reports.put(r2Key, bytes, { httpMetadata: { contentType: "application/zip" } }), catch: toExternalError });
    return archive;
  });

// -----
// Removes a zip: its row, then its bytes, in the caller's
// transaction, so bytes R2 would not delete keep their row.
// The Scans that read it stay in the History.
// -----
export const removeArchiveSvc = (
  db: AppDbType,
  reports: R2Bucket,
  accountId: string,
  repoId: string,
  archiveId: string,
): Effect.Effect<UploadArchiveRemoved, NotFound | DbError | ExternalError> =>
  Effect.gen(function* () {
    const r2Key = yield* deleteArchiveEffect(db, accountId, repoId, archiveId);
    yield* Effect.tryPromise({ try: () => reports.delete(r2Key), catch: toExternalError });
    return { removed: true as const };
  });
