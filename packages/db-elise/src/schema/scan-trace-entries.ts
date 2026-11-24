import { sql } from "drizzle-orm";
import { check, foreignKey, index, integer, pgTable, primaryKey, text, timestamp, uuid } from "drizzle-orm/pg-core";
import {
  RUNNER_JOB_PHASE_VALUES,
  TRACE_LABEL_VALUES,
  type RunnerJobPhaseValue,
  type TraceLabelValue,
} from "@repo/contracts/elise";
import { scans } from "./scans";
import { tenants } from "./tenant";

const inList = (values: readonly string[]) => sql.raw(values.map((value) => `'${value}'`).join(", "));

// -----
// A Scan's Trace: what kind of work the agent did, one row per run of
// the same label, and never any text, path or command from the agent.
// The producer names the row (a UUIDv7) and sends it again as it
// grows, so a write is an upsert on (scan_id, id). updated_at is the
// database's own time of the last write, the readers' poll cursor; the
// producer's started_at and ended_at only order and time the rows.
// Deleted with the Scan.
// -----
export const scanTraceEntries = pgTable(
  "scan_trace_entries",
  {
    id: uuid("id").notNull(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    scanId: text("scan_id").notNull(),
    label: text("label").$type<TraceLabelValue>().notNull(),
    phase: text("phase").$type<RunnerJobPhaseValue>(),
    startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }).notNull(),
    count: integer("count").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({ name: "scan_trace_entries_pk", columns: [t.scanId, t.id] }),
    chkLabel: check("scan_trace_entries_label", sql`${t.label} in (${inList(TRACE_LABEL_VALUES)})`),
    chkPhase: check(
      "scan_trace_entries_phase",
      sql`${t.phase} is null or ${t.phase} in (${inList(RUNNER_JOB_PHASE_VALUES)})`,
    ),
    chkCount: check("scan_trace_entries_count", sql`${t.count} >= 1`),
    fkScanTenant: foreignKey({
      name: "scan_trace_entries_scan_tenant_fk",
      columns: [t.scanId, t.tenantId],
      foreignColumns: [scans.id, scans.tenantId],
    }).onDelete("cascade"),
    idxScanUpdated: index("idx_scan_trace_entries_scan_updated").on(t.scanId, t.updatedAt),
  }),
);

export type TScanTraceEntry = typeof scanTraceEntries.$inferSelect;
