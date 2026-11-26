CREATE TABLE "tenant_projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "scan_repos" ADD COLUMN "project_id" uuid;--> statement-breakpoint
ALTER TABLE "tenant_projects" ADD CONSTRAINT "tenant_projects_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_tenant_projects_tenant_name" ON "tenant_projects" USING btree ("tenant_id",lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "uq_tenant_projects_id_tenant" ON "tenant_projects" USING btree ("id","tenant_id");--> statement-breakpoint
-- Deleting a Project ungroups its Repos. Only project_id is set to null: the tenant column of the composite key must stay.
ALTER TABLE "scan_repos" ADD CONSTRAINT "scan_repos_project_tenant_fk" FOREIGN KEY ("project_id","tenant_id") REFERENCES "public"."tenant_projects"("id","tenant_id") ON DELETE set null ("project_id") ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "idx_scan_repos_project" ON "scan_repos" USING btree ("tenant_id","project_id");--> statement-breakpoint
-- Same tenant isolation as tenant_groups: a role without BYPASSRLS (elise_app) sees and writes only the rows of the Tenant named by app.tenant_id.
ALTER TABLE "tenant_projects" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tenant_projects" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "tenant_projects"
  USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
