import { sql } from "drizzle-orm";
import { check, index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { CLI_ACCESS_SCOPE_VALUES, type CliAccessScopeValue } from "@repo/contracts/elise";
import { partyPersons } from "./party";
import { tenants } from "./tenant";

const inList = (values: readonly string[]) => sql.raw(values.map((value) => `'${value}'`).join(", "));

// -----
// CLI access: what one person let one Elise CLI do in one Account.
// It is its own credential, not a session and not a Runner token
// (docs/adr/0007 keeps a Runner away from a person's session). The
// row acts as person_id, who approved it at approved_at, and the
// person's Role limits it on every call. Only the token's hash is
// stored, so a copy of this table cannot act as a CLI. revoked_at
// stops it at once.
// -----
export const tenantCliAccess = pgTable(
  "tenant_cli_access",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => partyPersons.partyId, { onDelete: "restrict" }),
    name: text("name").notNull(),
    scope: text("scope").$type<CliAccessScopeValue>().notNull(),
    tokenHash: text("token_hash").notNull(),
    approvedAt: timestamp("approved_at", { withTimezone: true }).notNull(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    uqTokenHash: uniqueIndex("uq_tenant_cli_access_token_hash").on(t.tokenHash),
    idxTenant: index("idx_tenant_cli_access_tenant_id").on(t.tenantId),
    chkScope: check("tenant_cli_access_scope", sql`${t.scope} in (${inList(CLI_ACCESS_SCOPE_VALUES)})`),
  }),
);

export type TTenantCliAccess = typeof tenantCliAccess.$inferSelect;
