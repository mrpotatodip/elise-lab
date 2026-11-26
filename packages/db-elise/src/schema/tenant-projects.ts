import { sql } from "drizzle-orm";
import { index, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { tenants } from "./tenant";

// -----
// A Project is a named set of a Tenant's Repos, kept
// together so they can be reviewed together. It grants
// nothing and scans nothing. Names are unique within a
// Tenant, ignoring case. A Repo points at it through
// scan_repos.project_id.
// -----
export const tenantProjects = pgTable(
  "tenant_projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => ({
    uqTenantName: uniqueIndex("uq_tenant_projects_tenant_name").on(t.tenantId, sql`lower(${t.name})`),
    uqIdTenant: uniqueIndex("uq_tenant_projects_id_tenant").on(t.id, t.tenantId),
  }),
);

export type TTenantProject = typeof tenantProjects.$inferSelect;
