import { Effect } from "effect";
import {
  UPLOAD_ARCHIVES_PER_APP_MAX,
  UPLOAD_FILES_MAX,
  UPLOAD_NOT_A_ZIP_MESSAGE,
  UPLOAD_PATH_DEPTH_MAX,
  UPLOAD_STORAGE_PER_TENANT_MAX_MB,
  UPLOAD_UNPACKED_MAX_MB,
  type UploadArchive,
  type UploadArchiveList,
  type UploadArchiveRemoved,
} from "@repo/contracts/elise";
import type { AppDbType } from "#/lib/db-connection";
import {
  Conflict,
  Invalid,
  toExternalError,
  type DbError,
  type ExternalError,
  type NotFound,
} from "#/lib/effect-query";
import {
  MB,
  PATH_TOO_DEEP,
  STORAGE_FULL,
  TOO_MANY_ARCHIVES,
  TOO_MANY_FILES,
  UNPACKED_TOO_LARGE,
} from "#/modules/archives/constants";
import { deleteObjectsEffect, listObjectsEffect } from "#/modules/archives/lib";
import {
  archiveUsageEffect,
  deleteArchiveEffect,
  findUploadAppEffect,
  insertArchiveEffect,
  listArchivesEffect,
  removeUploadAppEffect,
} from "#/modules/archives/queries";
import { archiveKeyOf, archivePrefixOf, isZip, sha256HexOf, zipContentsOf } from "#/modules/archives/utils";

export const NOT_A_ZIP = UPLOAD_NOT_A_ZIP_MESSAGE;

export const listArchivesSvc = (
  db: AppDbType,
  accountId: string,
  repoId: string,
): Effect.Effect<UploadArchiveList, NotFound | DbError> =>
  findUploadAppEffect(db, accountId, repoId).pipe(
    Effect.flatMap(() => listArchivesEffect(db, accountId, repoId)),
    Effect.map((archives) => ({ archives })),
  );

// -----
// The limits a zip's own bytes must meet, read from its central
// directory (docs/adr/0008-git-providers.md).
// -----
const zipRefusalOf = (bytes: Uint8Array): Effect.Effect<void, Invalid> => {
  const contents = isZip(bytes) ? zipContentsOf(bytes) : null;
  if (contents === null) return Effect.fail(new Invalid({ message: NOT_A_ZIP }));
  if (contents.files > UPLOAD_FILES_MAX) return Effect.fail(new Invalid({ message: TOO_MANY_FILES }));
  if (contents.deepestPath > UPLOAD_PATH_DEPTH_MAX) return Effect.fail(new Invalid({ message: PATH_TOO_DEEP }));
  if (contents.unpackedBytes > UPLOAD_UNPACKED_MAX_MB * MB)
    return Effect.fail(new Invalid({ message: UNPACKED_TOO_LARGE }));
  return Effect.void;
};

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
): Effect.Effect<UploadArchive, Invalid | Conflict | NotFound | DbError | ExternalError> =>
  Effect.gen(function* () {
    yield* findUploadAppEffect(db, accountId, repoId);
    yield* zipRefusalOf(new Uint8Array(bytes));
    const usage = yield* archiveUsageEffect(db, accountId, repoId);
    if (usage.inApp >= UPLOAD_ARCHIVES_PER_APP_MAX) return yield* new Conflict({ message: TOO_MANY_ARCHIVES });
    if (usage.storedBytes + bytes.byteLength > UPLOAD_STORAGE_PER_TENANT_MAX_MB * MB)
      return yield* new Conflict({ message: STORAGE_FULL });
    const contentSha256 = yield* Effect.tryPromise({ try: () => sha256HexOf(bytes), catch: toExternalError });
    const id = crypto.randomUUID();
    const r2Key = archiveKeyOf(accountId, repoId, id);
    const archive = yield* insertArchiveEffect(db, {
      id,
      tenantId: accountId,
      repoId,
      label,
      r2Key,
      sizeBytes: bytes.byteLength,
      contentSha256,
    });
    yield* Effect.tryPromise({
      try: () => reports.put(r2Key, bytes, { httpMetadata: { contentType: "application/zip" } }),
      catch: toExternalError,
    });
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

// -----
// Removes an upload app: every zip's row, then every object under
// the app's prefix, in the caller's transaction. The prefix also
// holds the bytes of an upload whose row never committed, so
// those go too. The Repo row stays, marked removed, so its Scans
// and findings keep their History, each Scan with its zip's label
// and no file.
// -----
export const removeUploadAppSvc = (
  db: AppDbType,
  reports: R2Bucket,
  accountId: string,
  repoId: string,
  userId: string,
): Effect.Effect<UploadArchiveRemoved, NotFound | Conflict | DbError | ExternalError> =>
  Effect.gen(function* () {
    const rowKeys = yield* removeUploadAppEffect(db, accountId, repoId, userId);
    const stored = yield* listObjectsEffect(reports, archivePrefixOf(accountId, repoId));
    yield* deleteObjectsEffect(reports, [...new Set([...rowKeys, ...stored.map((object) => object.key)])]);
    return { removed: true as const };
  });
