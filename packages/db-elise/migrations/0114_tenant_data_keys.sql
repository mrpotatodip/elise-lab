CREATE TABLE "tenant_data_keys" (
	"tenant_id" uuid PRIMARY KEY NOT NULL,
	"wrapped_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "tenant_data_keys" ADD CONSTRAINT "tenant_data_keys_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- Same tenant isolation as tenant_projects: a role without BYPASSRLS (elise_app) sees and writes only the rows of the Tenant named by app.tenant_id.
ALTER TABLE "tenant_data_keys" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tenant_data_keys" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "tenant_data_keys"
  USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);