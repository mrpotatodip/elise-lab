import { sql } from "drizzle-orm";
import { check, foreignKey, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { FINDING_COMMENT_BODY_MAX } from "@repo/contracts/elise";
import { parties } from "./party";
import { scanRepos } from "./scans";
import { tenants } from "./tenant";

// -----
// The body is stored sealed: base64 of up to three bytes a character
// of the 4000 allowed, plus the marker, the nonce and the tag. The
// API still holds a comment to FINDING_COMMENT_BODY_MAX characters.
// -----
const SEALED_COMMENT_MAX = FINDING_COMMENT_BODY_MAX * 5 + 100;

// -----
// What a person wrote about a problem, kept per repo and
// fingerprint like the triage row, so a rescan shows the
// same thread. A Party removed from the system leaves the
// comment behind with no author. An edit sets edited_at; a
// delete sets deleted_at and deleted_by_party_id and empties
// the body, so only a live comment holds text.
// -----
export const scanFindingComments = pgTable(
  "scan_finding_comments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    repoId: uuid("repo_id").notNull(),
    fingerprint: text("fingerprint").notNull(),
    authorPartyId: uuid("author_party_id").references(() => parties.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    editedAt: timestamp("edited_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedByPartyId: uuid("deleted_by_party_id").references(() => parties.id, { onDelete: "set null" }),
  },
  (t) => ({
    chkBody: check(
      "scan_finding_comments_body",
      sql`${t.deletedAt} is not null or char_length(${t.body}) between 1 and ${sql.raw(String(SEALED_COMMENT_MAX))}`,
    ),
    fkRepoTenant: foreignKey({
      name: "scan_finding_comments_repo_tenant_fk",
      columns: [t.repoId, t.tenantId],
      foreignColumns: [scanRepos.id, scanRepos.tenantId],
    }).onDelete("cascade"),
    idxThread: index("idx_scan_finding_comments_thread").on(t.tenantId, t.repoId, t.fingerprint, t.createdAt),
  }),
);

export type TFindingComment = typeof scanFindingComments.$inferSelect;
