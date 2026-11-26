import { and, asc, desc, eq, inArray, isNull, lt, notExists, sql } from "drizzle-orm";
import { Effect } from "effect";
import type { ScanArchiveRef, UploadArchive } from "@repo/contracts/elise";
import { scanArchiveLinks, scanRepos, scans, scanUploadArchives, type TScanUploadArchive } from "@repo/db-elise/schema";
import type { AppDbType } from "#/lib/db-connection";
import { Conflict, Invalid, NotFound, toDbError, type DbError } from "#/lib/effect-query";
import { actorPartyOf, insertAuditEntry } from "#/modules/audit-trail";
import { liveScansSql } from "#/modules/scan-ledger/utils";

export const REPO_HAS_ACTIVE_SCAN = "A Scan of this Repo is queued or running; stop it or wait for it first";
export const UPLOAD_APP_NOT_FOUND = "Upload app not found";
export const REPO_NOT_FOUND = "Repo not found";
export const UPLOAD_ARCHIVE_NOT_FOUND = "Upload not found";

export const archiveViewOf = (row: TScanUploadArchive): UploadArchive => ({
  id: row.id,
  repoId: row.repoId,
  label: row.label,
  sizeBytes: row.sizeBytes,
  contentSha256: row.contentSha256,
  uploadedAt: row.uploadedAt.toISOString(),
});

// -----
// The Account's upload app with this id. A git Repo is not
// one, so it takes no zip, and a removed app takes none either.
// -----
export const findUploadAppEffect = (
  db: AppDbType,
  tenantId: string,
  repoId: string,
): Effect.Effect<{ id: string }, NotFound | DbError> =>
  Effect.tryPromise({
    try: () =>
      db
        .select({ id: scanRepos.id })
        .from(scanRepos)
        .where(
          and(
            eq(scanRepos.tenantId, tenantId),
            eq(scanRepos.id, repoId),
            eq(scanRepos.provider, "upload"),
            isNull(scanRepos.removedAt),
          ),
        ),
    catch: toDbError,
  }).pipe(
    Effect.flatMap(([row]) =>
      row ? Effect.succeed(row) : Effect.fail(new NotFound({ message: UPLOAD_APP_NOT_FOUND })),
    ),
  );

// -----
// Soft-deletes a repo of any provider: marks it removed, and
// deletes the rows of its zips (an upload app has them, a git
// Repo has none) and gives back where their bytes are. The Repo
// row stays, so its Scans and findings keep their History; the
// links of those Scans keep each zip's label and hash.
//
// The Repo row is locked first, and a new Scan locks it too
// (ensureRepo), so a Scan made while this runs is either seen
// by the live check or waits for the remove. A stalled Scan
// does not block it. A Repo that is not there, or already
// removed, is not found.
// -----
export const removeUploadAppEffect = (
  db: AppDbType,
  tenantId: string,
  repoId: string,
  userId: string,
): Effect.Effect<string[], NotFound | Conflict | DbError> =>
  Effect.tryPromise({
    try: async () => {
      const [locked] = await db
        .select({ id: scanRepos.id })
        .from(scanRepos)
        .where(and(eq(scanRepos.tenantId, tenantId), eq(scanRepos.id, repoId), isNull(scanRepos.removedAt)))
        .for("update");
      if (!locked) return "missing" as const;
      const [live] = await db
        .select({ id: scans.id })
        .from(scans)
        .where(and(eq(scans.tenantId, tenantId), eq(scans.repoId, repoId), liveScansSql(Date.now())))
        .limit(1);
      if (live) return "live" as const;
      const actorPartyId = await actorPartyOf(db, userId);
      const deleted = await db
        .delete(scanUploadArchives)
        .where(and(eq(scanUploadArchives.tenantId, tenantId), eq(scanUploadArchives.repoId, repoId)))
        .returning({ r2Key: scanUploadArchives.r2Key });
      await db
        .update(scanRepos)
        .set({ removedAt: new Date(), projectId: null })
        .where(and(eq(scanRepos.tenantId, tenantId), eq(scanRepos.id, repoId)));
      // SAFETY: the tenant transaction's insert answers like the pool's one AuditDb names, and access_audit_log has no row-level security.
      await insertAuditEntry(db as never, { actorPartyId, action: "repo.removed", subjectId: repoId, tenantId });
      return deleted.map((row) => row.r2Key);
    },
    catch: toDbError,
  }).pipe(
    Effect.flatMap((result): Effect.Effect<string[], NotFound | Conflict> => {
      if (result === "missing") return Effect.fail(new NotFound({ message: REPO_NOT_FOUND }));
      if (result === "live") return Effect.fail(new Conflict({ message: REPO_HAS_ACTIVE_SCAN }));
      return Effect.succeed(result);
    }),
  );

export const listArchivesEffect = (
  db: AppDbType,
  tenantId: string,
  repoId: string,
): Effect.Effect<UploadArchive[], DbError> =>
  Effect.tryPromise({
    try: () =>
      db
        .select()
        .from(scanUploadArchives)
        .where(and(eq(scanUploadArchives.tenantId, tenantId), eq(scanUploadArchives.repoId, repoId)))
        .orderBy(desc(scanUploadArchives.uploadedAt), desc(scanUploadArchives.id)),
    catch: toDbError,
  }).pipe(Effect.map((rows) => rows.map(archiveViewOf)));

// -----
// How many zips the app holds and how many bytes of zips the
// whole Account stores, for the limits a new zip must fit in.
// -----
export const archiveUsageEffect = (
  db: AppDbType,
  tenantId: string,
  repoId: string,
): Effect.Effect<{ inApp: number; storedBytes: number }, DbError> =>
  Effect.tryPromise({
    try: () =>
      db
        .select({
          inApp: sql<number>`count(*) filter (where ${scanUploadArchives.repoId} = ${repoId})`.mapWith(Number),
          storedBytes: sql<number>`coalesce(sum(${scanUploadArchives.sizeBytes}), 0)`.mapWith(Number),
        })
        .from(scanUploadArchives)
        .where(eq(scanUploadArchives.tenantId, tenantId)),
    catch: toDbError,
  }).pipe(Effect.map(([usage]) => usage ?? { inApp: 0, storedBytes: 0 }));

// -----
// The retention sweep's queries run on the owner role across
// Accounts: no request names one. Each deletes or reads only
// upload rows.
//
// Deletes up to `limit` zips uploaded before `before` that no
// Scan has read (no link points at them), oldest first, and gives
// back where their bytes are.
// -----
export const deleteExpiredArchivesEffect = (
  db: AppDbType,
  before: Date,
  limit: number,
): Effect.Effect<string[], DbError> =>
  Effect.tryPromise({
    try: () =>
      db
        .delete(scanUploadArchives)
        .where(
          inArray(
            scanUploadArchives.id,
            db
              .select({ id: scanUploadArchives.id })
              .from(scanUploadArchives)
              .where(
                and(
                  lt(scanUploadArchives.uploadedAt, before),
                  notExists(
                    db
                      .select({ scanId: scanArchiveLinks.scanId })
                      .from(scanArchiveLinks)
                      .where(eq(scanArchiveLinks.archiveId, scanUploadArchives.id)),
                  ),
                ),
              )
              .orderBy(asc(scanUploadArchives.uploadedAt))
              .limit(limit),
          ),
        )
        .returning({ r2Key: scanUploadArchives.r2Key }),
    catch: toDbError,
  }).pipe(Effect.map((rows) => rows.map((row) => row.r2Key)));

export const sampleUploadAppsEffect = (
  db: AppDbType,
  limit: number,
): Effect.Effect<{ tenantId: string; id: string }[], DbError> =>
  Effect.tryPromise({
    try: () =>
      db
        .select({ tenantId: scanRepos.tenantId, id: scanRepos.id })
        .from(scanRepos)
        .where(eq(scanRepos.provider, "upload"))
        .orderBy(sql`random()`)
        .limit(limit),
    catch: toDbError,
  });

export const archiveKeysAmongEffect = (db: AppDbType, keys: readonly string[]): Effect.Effect<Set<string>, DbError> =>
  keys.length === 0
    ? Effect.succeed(new Set())
    : Effect.tryPromise({
        try: () =>
          db
            .select({ r2Key: scanUploadArchives.r2Key })
            .from(scanUploadArchives)
            .where(inArray(scanUploadArchives.r2Key, [...keys])),
        catch: toDbError,
      }).pipe(Effect.map((rows) => new Set(rows.map((row) => row.r2Key))));

export type NewArchive = {
  id: string;
  tenantId: string;
  repoId: string;
  label: string;
  r2Key: string;
  sizeBytes: number;
  contentSha256: string;
};

export const insertArchiveEffect = (db: AppDbType, archive: NewArchive): Effect.Effect<UploadArchive, DbError> =>
  Effect.tryPromise({ try: () => db.insert(scanUploadArchives).values(archive).returning(), catch: toDbError }).pipe(
    Effect.map(([row]) => archiveViewOf(row)),
  );

export const ARCHIVE_NOT_IN_APP = "archive_id: no such zip in this upload app";

export type ScanArchiveLink = { scanId: string; repoId: string; archiveId: string; branch: string };

// -----
// Records which zip a new upload Scan reads, in the transaction
// that wrote the Scan. The Scan sits on the app's hidden Branch
// with the zip's hash as its commit, so the zips of one app are
// versions in one History. A zip of another app or Account is
// refused, and the caller's transaction rolls the Scan back.
// -----
export const linkScanArchiveEffect = (
  db: AppDbType,
  tenantId: string,
  link: ScanArchiveLink,
): Effect.Effect<void, Invalid | DbError> =>
  Effect.gen(function* () {
    const [archive] = yield* Effect.tryPromise({
      try: () =>
        db
          .select({ label: scanUploadArchives.label, contentSha256: scanUploadArchives.contentSha256 })
          .from(scanUploadArchives)
          .where(
            and(
              eq(scanUploadArchives.tenantId, tenantId),
              eq(scanUploadArchives.repoId, link.repoId),
              eq(scanUploadArchives.id, link.archiveId),
            ),
          ),
      catch: toDbError,
    });
    if (!archive) return yield* new Invalid({ message: ARCHIVE_NOT_IN_APP });
    yield* Effect.tryPromise({
      try: async () => {
        await db.insert(scanArchiveLinks).values({
          scanId: link.scanId,
          tenantId,
          archiveId: link.archiveId,
          label: archive.label,
          contentSha256: archive.contentSha256,
        });
        await db
          .update(scans)
          .set({ branch: link.branch, commitSha: archive.contentSha256 })
          .where(and(eq(scans.tenantId, tenantId), eq(scans.id, link.scanId)));
      },
      catch: toDbError,
    });
  });

// -----
// The zip each of these Scans read, for the Scans that read
// one. archive id is null once the zip is removed: the label
// and hash stay, so the History can say "file removed".
// -----
export const scanArchivesEffect = (
  db: AppDbType,
  scanIds: readonly string[],
): Effect.Effect<Map<string, ScanArchiveRef>, DbError> =>
  scanIds.length === 0
    ? Effect.succeed(new Map())
    : Effect.tryPromise({
        try: () =>
          db
            .select({
              scanId: scanArchiveLinks.scanId,
              id: scanArchiveLinks.archiveId,
              label: scanArchiveLinks.label,
              contentSha256: scanArchiveLinks.contentSha256,
            })
            .from(scanArchiveLinks)
            .where(inArray(scanArchiveLinks.scanId, [...scanIds])),
        catch: toDbError,
      }).pipe(Effect.map((rows) => new Map(rows.map(({ scanId, ...archive }) => [scanId, archive]))));

export const scanArchiveOfEffect = (db: AppDbType, scanId: string): Effect.Effect<ScanArchiveRef | null, DbError> =>
  scanArchivesEffect(db, [scanId]).pipe(Effect.map((found) => found.get(scanId) ?? null));

// -----
// Where a zip's bytes are, or null once it is removed. Owner
// role: the Runner's download asks by the zip its job links to,
// after checking the Runner claimed that job.
// -----
export const archiveKeyEffect = (db: AppDbType, archiveId: string): Effect.Effect<string | null, DbError> =>
  Effect.tryPromise({
    try: () =>
      db
        .select({ r2Key: scanUploadArchives.r2Key })
        .from(scanUploadArchives)
        .where(eq(scanUploadArchives.id, archiveId)),
    catch: toDbError,
  }).pipe(Effect.map(([row]) => row?.r2Key ?? null));

// -----
// Deletes the row and gives back where its bytes are. The
// links of the Scans that read it keep their label and hash,
// and their archive_id turns null.
// -----
export const deleteArchiveEffect = (
  db: AppDbType,
  tenantId: string,
  repoId: string,
  archiveId: string,
): Effect.Effect<string, NotFound | DbError> =>
  Effect.tryPromise({
    try: () =>
      db
        .delete(scanUploadArchives)
        .where(
          and(
            eq(scanUploadArchives.tenantId, tenantId),
            eq(scanUploadArchives.repoId, repoId),
            eq(scanUploadArchives.id, archiveId),
          ),
        )
        .returning({ r2Key: scanUploadArchives.r2Key }),
    catch: toDbError,
  }).pipe(
    Effect.flatMap(([row]) =>
      row ? Effect.succeed(row.r2Key) : Effect.fail(new NotFound({ message: UPLOAD_ARCHIVE_NOT_FOUND })),
    ),
  );
