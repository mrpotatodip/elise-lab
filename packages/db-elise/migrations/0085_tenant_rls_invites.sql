-- Row-level security on the two invite tables 0084 left out, with the same policy: a role without BYPASSRLS (elise_app)
-- sees and writes only the rows of the Tenant named by app.tenant_id, and with none set it sees nothing. Listing, making
-- and revoking an invite now run as one Tenant. Invite preview and accept find the invite by its token before any Tenant
-- is known, so they stay on the owner role, which keeps BYPASSRLS.
ALTER TABLE "tenant_team_invites" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tenant_team_invites" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "tenant_team_invites"
  USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "tenant_team_invite_groups" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "tenant_team_invite_groups" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "tenant_team_invite_groups"
  USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
