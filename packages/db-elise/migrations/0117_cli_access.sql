CREATE TABLE "tenant_cli_access" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"name" text NOT NULL,
	"scope" text NOT NULL,
	"token_hash" text NOT NULL,
	"approved_at" timestamp with time zone NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tenant_cli_access_scope" CHECK ("tenant_cli_access"."scope" in ('read', 'start', 'admin'))
);
--> statement-breakpoint
ALTER TABLE "platform_runner_device_logins" ADD COLUMN "run_scans" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "platform_runner_device_logins" ADD COLUMN "cli_scope" text;--> statement-breakpoint
ALTER TABLE "platform_runner_device_logins" ADD COLUMN "approved_name" text;--> statement-breakpoint
ALTER TABLE "tenant_cli_access" ADD CONSTRAINT "tenant_cli_access_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tenant_cli_access" ADD CONSTRAINT "tenant_cli_access_person_id_party_persons_party_id_fk" FOREIGN KEY ("person_id") REFERENCES "public"."party_persons"("party_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_tenant_cli_access_token_hash" ON "tenant_cli_access" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "idx_tenant_cli_access_tenant_id" ON "tenant_cli_access" USING btree ("tenant_id");--> statement-breakpoint
ALTER TABLE "platform_runner_device_logins" ADD CONSTRAINT "platform_runner_device_logins_cli_scope" CHECK ("platform_runner_device_logins"."cli_scope" is null or "platform_runner_device_logins"."cli_scope" in ('read', 'start', 'admin'));--> statement-breakpoint
-- Same tenant isolation as tenant_runners: a role without BYPASSRLS (elise_app) sees and writes only the rows of the Tenant named by app.tenant_id. The token lookup and the login collect run as the owner, like a Runner's.
ALTER TABLE "tenant_cli_access" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tenant_cli_access" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "tenant_cli_access"
  USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);