-- The 2FA reset Power, granted in the same step as the code that checks it: a tenant_admin and a workspace_admin hold it (the route and its query refuse a workspace_admin on an admin, and anyone on themself).
INSERT INTO "access_master_powers" ("power", "scope") VALUES
  ('company:team:two_factor:reset', 'tenant')
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "access_role_powers" ("master_role_id", "master_power_id", "scope")
SELECT r."id", p."id", 'tenant'
FROM "access_master_roles" r
JOIN "access_master_powers" p ON p."power" = 'company:team:two_factor:reset'
WHERE r."key" IN ('tenant_admin', 'workspace_admin') AND r."scope" = 'tenant'
ON CONFLICT DO NOTHING;
