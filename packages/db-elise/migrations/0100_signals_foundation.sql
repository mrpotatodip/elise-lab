CREATE TABLE "scan_signals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"repo_id" uuid NOT NULL,
	"fingerprint" text NOT NULL,
	"related_fingerprint" text,
	"kind" text NOT NULL,
	"probability" real NOT NULL,
	"model_version" text NOT NULL,
	"dismissed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tenants" ADD COLUMN "signals_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "scan_signals" ADD CONSTRAINT "scan_signals_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scan_signals" ADD CONSTRAINT "scan_signals_repo_tenant_fk" FOREIGN KEY ("repo_id","tenant_id") REFERENCES "public"."scan_repos"("id","tenant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_scan_signals_repo" ON "scan_signals" USING btree ("tenant_id","repo_id","fingerprint");--> statement-breakpoint
-- Same tenant isolation as scan_finding_comments: a role without BYPASSRLS (elise_app) sees and writes only the rows of the Tenant named by app.tenant_id.
ALTER TABLE "scan_signals" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "scan_signals" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "scan_signals"
  USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
-- The Power to turn Signals on or off, granted in the same step as the code that checks it. The switch itself defaults to on for every Account, existing ones included.
INSERT INTO "access_master_powers" ("power", "scope") VALUES
  ('company:signals:update', 'tenant')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "access_role_powers" ("master_role_id", "master_power_id", "scope")
SELECT r."id", p."id", 'tenant'
FROM "access_master_roles" r
JOIN "access_master_powers" p ON p."power" = 'company:signals:update'
WHERE r."key" = 'tenant_admin' AND r."scope" = 'tenant'
ON CONFLICT DO NOTHING;