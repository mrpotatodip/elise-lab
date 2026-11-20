ALTER TABLE "scans" DROP CONSTRAINT "scans_installation_tenant_fk";--> statement-breakpoint
ALTER TABLE "scans" DROP COLUMN "installation_id";--> statement-breakpoint
ALTER TABLE "scans" DROP COLUMN "github_repo_id";--> statement-breakpoint
DROP POLICY "tenant_isolation" ON "tenant_github_installations";--> statement-breakpoint
ALTER TABLE "tenant_github_installations" NO FORCE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tenant_github_installations" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "tenant_github_installations";--> statement-breakpoint
DELETE FROM "access_role_powers" rp
USING "access_master_powers" p
WHERE rp."master_power_id" = p."id"
  AND p."power" IN ('company:github:installations:create', 'company:github:installations:delete');--> statement-breakpoint
DELETE FROM "access_master_powers"
WHERE "power" IN ('company:github:installations:create', 'company:github:installations:delete');
