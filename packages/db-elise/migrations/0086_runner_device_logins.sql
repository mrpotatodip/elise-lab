CREATE TABLE "platform_runner_device_logins" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_code_hash" text NOT NULL,
	"device_code_hash" text NOT NULL,
	"suggested_name" text NOT NULL,
	"os" text NOT NULL,
	"cpu" text NOT NULL,
	"runner_version" text NOT NULL,
	"request_ip" text NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"tenant_id" uuid,
	"runner_id" uuid,
	"approved_by" uuid,
	"approver_ip" text,
	"approved_at" timestamp with time zone,
	"collected_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "platform_runner_device_logins_state" CHECK ("platform_runner_device_logins"."state" in ('pending', 'approved', 'denied', 'collected'))
);
--> statement-breakpoint
ALTER TABLE "platform_runner_device_logins" ADD CONSTRAINT "platform_runner_device_logins_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_runner_device_logins" ADD CONSTRAINT "platform_runner_device_logins_runner_id_tenant_runners_id_fk" FOREIGN KEY ("runner_id") REFERENCES "public"."tenant_runners"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_runner_device_logins" ADD CONSTRAINT "platform_runner_device_logins_approved_by_party_persons_party_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."party_persons"("party_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_platform_runner_device_logins_user_code_hash" ON "platform_runner_device_logins" USING btree ("user_code_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_platform_runner_device_logins_device_code_hash" ON "platform_runner_device_logins" USING btree ("device_code_hash");--> statement-breakpoint
CREATE INDEX "idx_platform_runner_device_logins_expires_at" ON "platform_runner_device_logins" USING btree ("expires_at");