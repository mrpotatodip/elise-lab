CREATE TABLE "scan_finding_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"repo_id" uuid NOT NULL,
	"fingerprint" text NOT NULL,
	"author_party_id" uuid,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"edited_at" timestamp with time zone,
	"deleted_at" timestamp with time zone,
	"deleted_by_party_id" uuid,
	CONSTRAINT "scan_finding_comments_body" CHECK ("scan_finding_comments"."deleted_at" is not null or char_length("scan_finding_comments"."body") between 1 and 4000)
);
--> statement-breakpoint
ALTER TABLE "scan_finding_comments" ADD CONSTRAINT "scan_finding_comments_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scan_finding_comments" ADD CONSTRAINT "scan_finding_comments_author_party_id_parties_id_fk" FOREIGN KEY ("author_party_id") REFERENCES "public"."parties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scan_finding_comments" ADD CONSTRAINT "scan_finding_comments_deleted_by_party_id_parties_id_fk" FOREIGN KEY ("deleted_by_party_id") REFERENCES "public"."parties"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scan_finding_comments" ADD CONSTRAINT "scan_finding_comments_repo_tenant_fk" FOREIGN KEY ("repo_id","tenant_id") REFERENCES "public"."scan_repos"("id","tenant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_scan_finding_comments_thread" ON "scan_finding_comments" USING btree ("tenant_id","repo_id","fingerprint","created_at");--> statement-breakpoint
-- Same tenant isolation as scan_finding_triage: a role without BYPASSRLS (elise_app) sees and writes only the rows of the Tenant named by app.tenant_id.
ALTER TABLE "scan_finding_comments" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "scan_finding_comments" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "scan_finding_comments"
  USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
-- The Power to write a comment, granted in the same step as the code that checks it.
INSERT INTO "access_master_powers" ("power", "scope") VALUES
  ('company:findings:comments:create', 'tenant')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "access_role_powers" ("master_role_id", "master_power_id", "scope")
SELECT r."id", p."id", 'tenant'
FROM "access_master_roles" r
JOIN "access_master_powers" p ON p."power" = 'company:findings:comments:create'
WHERE r."key" IN ('tenant_admin', 'workspace_admin', 'workspace_member') AND r."scope" = 'tenant'
ON CONFLICT DO NOTHING;