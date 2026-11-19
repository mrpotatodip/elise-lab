CREATE TABLE "scan_trace_entries" (
	"id" uuid NOT NULL,
	"tenant_id" uuid NOT NULL,
	"scan_id" text NOT NULL,
	"label" text NOT NULL,
	"phase" text,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone NOT NULL,
	"count" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scan_trace_entries_pk" PRIMARY KEY("scan_id","id"),
	CONSTRAINT "scan_trace_entries_label" CHECK ("scan_trace_entries"."label" in ('reasoning', 'reading_files', 'searching', 'running_command', 'writing', 'calling_tool', 'phase_started', 'phase_ended')),
	CONSTRAINT "scan_trace_entries_phase" CHECK ("scan_trace_entries"."phase" is null or "scan_trace_entries"."phase" in ('recon', 'hunt', 'check', 'report')),
	CONSTRAINT "scan_trace_entries_count" CHECK ("scan_trace_entries"."count" >= 1)
);
--> statement-breakpoint
ALTER TABLE "scans" ADD COLUMN "trace_candidate_findings" integer;--> statement-breakpoint
ALTER TABLE "scan_trace_entries" ADD CONSTRAINT "scan_trace_entries_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scan_trace_entries" ADD CONSTRAINT "scan_trace_entries_scan_tenant_fk" FOREIGN KEY ("scan_id","tenant_id") REFERENCES "public"."scans"("id","tenant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_scan_trace_entries_scan_updated" ON "scan_trace_entries" USING btree ("scan_id","updated_at");--> statement-breakpoint
-- Same tenant isolation as the other Scan tables: a role without BYPASSRLS (elise_app) sees and writes only the rows of the Tenant named by app.tenant_id.
ALTER TABLE "scan_trace_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "scan_trace_entries" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "scan_trace_entries"
  USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);