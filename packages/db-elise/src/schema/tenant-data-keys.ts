import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { tenants } from "./tenant";

// -----
// The Data key of an Account (ADR 0017): the key that seals the
// Account's free text. One row per Account, made on first use.
// wrapped_key is the key locked by the master secret that lives
// only in the Worker (AES-GCM, with the Account ID as additional
// data), so a copy of this table alone cannot open any text.
// -----
export const tenantDataKeys = pgTable("tenant_data_keys", {
  tenantId: uuid("tenant_id")
    .primaryKey()
    .references(() => tenants.id, { onDelete: "cascade" }),
  wrappedKey: text("wrapped_key").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export type TTenantDataKey = typeof tenantDataKeys.$inferSelect;
