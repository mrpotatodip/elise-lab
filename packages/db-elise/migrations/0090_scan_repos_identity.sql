ALTER TABLE "scan_repos" ADD COLUMN "host" text DEFAULT 'github.com';--> statement-breakpoint
ALTER TABLE "scan_repos" ADD CONSTRAINT "scan_repos_provider" CHECK ("scan_repos"."provider" in ('github', 'gitlab', 'gitlab-sh', 'upload'));--> statement-breakpoint
ALTER TABLE "scan_repos" ADD CONSTRAINT "scan_repos_host" CHECK ("scan_repos"."host" = lower("scan_repos"."host"));--> statement-breakpoint
ALTER TABLE "scan_repos" ADD CONSTRAINT "uq_scan_repos_tenant_identity" UNIQUE NULLS NOT DISTINCT("tenant_id","provider","host","canonical");--> statement-breakpoint
DROP INDEX "uq_scan_repos_tenant_canonical";
