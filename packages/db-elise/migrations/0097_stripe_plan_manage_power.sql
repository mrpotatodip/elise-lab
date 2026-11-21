ALTER TABLE "tenant_subscriptions" ADD COLUMN "cancel_at_period_end" boolean DEFAULT false NOT NULL;--> statement-breakpoint
INSERT INTO "access_master_powers" ("power", "scope") VALUES
  ('company:plan:manage', 'tenant')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "access_role_powers" ("master_role_id", "master_power_id", "scope")
SELECT r."id", p."id", 'tenant'
FROM "access_master_roles" r
JOIN "access_master_powers" p ON p."power" = 'company:plan:manage'
WHERE r."key" = 'tenant_admin' AND r."scope" = 'tenant'
ON CONFLICT DO NOTHING;
