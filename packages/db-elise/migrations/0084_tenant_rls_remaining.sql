-- Row-level security on the rest of the Tenant tables: the second step after 0079. The same policy as there: a role without
-- BYPASSRLS (elise_app) sees and writes only the rows of the Tenant named by app.tenant_id, and with none set it sees nothing.
-- The owner role keeps BYPASSRLS, so nothing changes for a Worker path that still connects as the owner.
--
-- No policy, on purpose:
--   tenants                    its key is id, not tenant_id; a Tenant reads its own row by id.
--   tenant_team_invites        an invite is found by its token before the person belongs to any Tenant, so there is
--   tenant_team_invite_groups  no app.tenant_id to set yet. They stay on the owner role.
--   party_master_roles         platform Roles have a null tenant_id and every Account must read them, and a Role
--   party_roles                check runs before any Tenant is set.
--   platform_invite_code_redemptions  written by sign-up, before the caller knows the Tenant it starts.
--   chat_bot_messages, chat_bot_thread_sessions  the chat runtime has anonymous Customers and holds no Scan data.
-- The test in apps/elise-engine-api/src/__tests__/tenant-isolation.test.ts lists the same exceptions and fails on any
-- other table that has a tenant_id column and no policy.
ALTER TABLE "scan_repos" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "scan_repos" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "scan_repos"
  USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "scan_repo_branches" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "scan_repo_branches" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "scan_repo_branches"
  USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "scan_repo_findings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "scan_repo_findings" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "scan_repo_findings"
  USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "scan_files" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "scan_files" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "scan_files"
  USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "scan_runner_jobs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "scan_runner_jobs" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "scan_runner_jobs"
  USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "tenant_credit_ledger" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tenant_credit_ledger" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "tenant_credit_ledger"
  USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "tenant_runners" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tenant_runners" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "tenant_runners"
  USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "tenant_anthropic_keys" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tenant_anthropic_keys" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "tenant_anthropic_keys"
  USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "tenant_subscriptions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tenant_subscriptions" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "tenant_subscriptions"
  USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "tenant_github_installations" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tenant_github_installations" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "tenant_github_installations"
  USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "tenant_groups" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tenant_groups" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "tenant_groups"
  USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "tenant_group_members" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tenant_group_members" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "tenant_group_members"
  USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
