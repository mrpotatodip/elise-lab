ALTER TABLE "tenants" ADD COLUMN "two_factor_required" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- The Power to require Two-factor of the whole Account, granted in the same step as the code that checks it. Only a tenant_admin holds it; the requirement is off for every Account.
INSERT INTO "access_master_powers" ("power", "scope") VALUES
  ('company:team:two_factor_requirement:update', 'tenant')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "access_role_powers" ("master_role_id", "master_power_id", "scope")
SELECT r."id", p."id", 'tenant'
FROM "access_master_roles" r
JOIN "access_master_powers" p ON p."power" = 'company:team:two_factor_requirement:update'
WHERE r."key" = 'tenant_admin' AND r."scope" = 'tenant'
ON CONFLICT DO NOTHING;