import { foreignKey, index, pgTable, real, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { scanRepos } from "./scans";
import { tenants } from "./tenant";

// -----
// A hint from an outside model about a Finding of a repo (ADR
// 0011). It never changes a Finding or a decision. probability
// is the raw answer and model_version the model that gave it,
// so a new threshold needs no new call. related_fingerprint is
// the other Finding of a duplicate pair, null for a kind that
// has one. dismissed_at hides the Signal for the Account.
// -----
export const scanSignals = pgTable(
  "scan_signals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    repoId: uuid("repo_id").notNull(),
    fingerprint: text("fingerprint").notNull(),
    relatedFingerprint: text("related_fingerprint"),
    kind: text("kind").notNull(),
    probability: real("probability").notNull(),
    modelVersion: text("model_version").notNull(),
    dismissedAt: timestamp("dismissed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => ({
    fkRepoTenant: foreignKey({
      name: "scan_signals_repo_tenant_fk",
      columns: [t.repoId, t.tenantId],
      foreignColumns: [scanRepos.id, scanRepos.tenantId],
    }).onDelete("cascade"),
    idxRepo: index("idx_scan_signals_repo").on(t.tenantId, t.repoId, t.fingerprint),
  }),
);

export type TScanSignal = typeof scanSignals.$inferSelect;
