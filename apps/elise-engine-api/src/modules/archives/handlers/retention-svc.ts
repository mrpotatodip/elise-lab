import { Effect } from "effect";
import { UPLOAD_ARCHIVE_RETENTION_DAYS } from "@repo/contracts/elise";
import type { AppDbType, AppTxDbType } from "#/lib/db-connection";
import { effectInCallback, type DbError, type ExternalError } from "#/lib/effect-query";
import { DAY_MS, ORPHAN_MIN_AGE_MS, ORPHAN_SWEEP_APPS, RETENTION_BATCH } from "#/modules/archives/constants";
import { deleteObjectsEffect, listObjectsEffect } from "#/modules/archives/lib";
import {
  archiveKeysAmongEffect,
  deleteExpiredArchivesEffect,
  sampleUploadAppsEffect,
} from "#/modules/archives/queries";
import { archivePrefixOf } from "#/modules/archives/utils";

export type UploadSweep = { expired: number; orphans: number };

// -----
// A zip no Scan has read is deleted UPLOAD_ARCHIVE_RETENTION_DAYS
// after upload: its rows, then its bytes, in one transaction, so
// bytes R2 would not delete keep their rows for the next run. A
// zip a Scan read stays until a person removes it.
// -----
const sweepExpiredEffect = (
  db: AppTxDbType,
  reports: R2Bucket,
  now: Date,
): Effect.Effect<number, DbError | ExternalError> =>
  effectInCallback<AppDbType, number, DbError | ExternalError>(
    (callback) => db.transaction(callback),
    (tx) =>
      deleteExpiredArchivesEffect(
        tx,
        new Date(now.getTime() - UPLOAD_ARCHIVE_RETENTION_DAYS * DAY_MS),
        RETENTION_BATCH,
      ).pipe(
        Effect.tap((keys) => deleteObjectsEffect(reports, keys)),
        Effect.map((keys) => keys.length),
      ),
  );

// -----
// An upload writes its row, then its bytes, then commits: when the
// commit fails, the bytes stay with no row. Under a sample of upload
// apps, an object a day old with no row is deleted.
// -----
const sweepOrphansEffect = (
  db: AppTxDbType,
  reports: R2Bucket,
  now: Date,
): Effect.Effect<number, DbError | ExternalError> =>
  sampleUploadAppsEffect(db, ORPHAN_SWEEP_APPS).pipe(
    Effect.flatMap((apps) =>
      Effect.forEach(apps, (app) =>
        Effect.gen(function* () {
          const stale = (yield* listObjectsEffect(reports, archivePrefixOf(app.tenantId, app.id))).filter(
            (object) => now.getTime() - object.uploaded.getTime() >= ORPHAN_MIN_AGE_MS,
          );
          const tracked = yield* archiveKeysAmongEffect(
            db,
            stale.map((object) => object.key),
          );
          const orphans = stale.map((object) => object.key).filter((key) => !tracked.has(key));
          yield* deleteObjectsEffect(reports, orphans);
          return orphans.length;
        }),
      ),
    ),
    Effect.map((counts) => counts.reduce((sum, count) => sum + count, 0)),
  );

// -----
// The daily retention run, on the owner role: no request names an
// Account, and the sweep crosses them all.
// -----
export const sweepUploadsSvc = (
  db: AppTxDbType,
  reports: R2Bucket,
  now: Date,
): Effect.Effect<UploadSweep, DbError | ExternalError> =>
  Effect.gen(function* () {
    const expired = yield* sweepExpiredEffect(db, reports, now);
    const orphans = yield* sweepOrphansEffect(db, reports, now);
    return { expired, orphans };
  });
