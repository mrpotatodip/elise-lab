import { sql } from "drizzle-orm";
import { bigint, check, foreignKey, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { scanRepos, scans } from "./scans";
import { tenants } from "./tenant";

// -----
// One zip of source code uploaded under an upload app (a
// Repo with provider upload). r2_key is where the bytes
// are, under accounts/{tenant_id}/, so every object in the
// bucket has a row here. content_sha256 stands in for the
// commit: the History of the app reads it as one.
// -----
export const scanUploadArchives = pgTable(
  "scan_upload_archives",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    repoId: uuid("repo_id").notNull(),
    label: text("label").notNull(),
    r2Key: text("r2_key").notNull(),
    sizeBytes: bigint("size_bytes", { mode: "number" }).notNull(),
    contentSha256: text("content_sha256").notNull(),
    uploadedAt: timestamp("uploaded_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    chkLabel: check("scan_upload_archives_label", sql`length(${t.label}) > 0`),
    chkSha: check("scan_upload_archives_sha", sql`${t.contentSha256} ~ '^[0-9a-f]{64}$'`),
    uqIdTenant: uniqueIndex("uq_scan_upload_archives_id_tenant").on(t.id, t.tenantId),
    uqR2Key: uniqueIndex("uq_scan_upload_archives_r2_key").on(t.r2Key),
    idxRepoUploaded: index("idx_scan_upload_archives_repo_uploaded_at").on(t.repoId, t.uploadedAt),
    fkRepoTenant: foreignKey({
      name: "scan_upload_archives_repo_tenant_fk",
      columns: [t.repoId, t.tenantId],
      foreignColumns: [scanRepos.id, scanRepos.tenantId],
    }).onDelete("cascade"),
  }),
);

// -----
// Which archive a Scan read: one row per upload Scan, so
// the shared scans table has no upload columns. label and
// content_sha256 are copied from the archive, and
// archive_id turns null when the zip is removed (only that
// column: the migration names it), so the Scan keeps in
// its History which zip it read, marked "file removed".
// -----
export const scanArchiveLinks = pgTable(
  "scan_archive_links",
  {
    scanId: text("scan_id").primaryKey(),
    tenantId: uuid("tenant_id").notNull(),
    archiveId: uuid("archive_id"),
    label: text("label").notNull(),
    contentSha256: text("content_sha256").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    idxArchive: index("idx_scan_archive_links_archive").on(t.archiveId),
    fkScanTenant: foreignKey({
      name: "scan_archive_links_scan_tenant_fk",
      columns: [t.scanId, t.tenantId],
      foreignColumns: [scans.id, scans.tenantId],
    }).onDelete("cascade"),
    fkArchiveTenant: foreignKey({
      name: "scan_archive_links_archive_tenant_fk",
      columns: [t.archiveId, t.tenantId],
      foreignColumns: [scanUploadArchives.id, scanUploadArchives.tenantId],
    }).onDelete("set null"),
  }),
);

export type TScanUploadArchive = typeof scanUploadArchives.$inferSelect;
export type TScanArchiveLink = typeof scanArchiveLinks.$inferSelect;
