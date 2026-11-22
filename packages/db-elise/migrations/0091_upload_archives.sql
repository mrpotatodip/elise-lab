-- Upload apps (#229): the zips stored under an upload app, and which zip each upload Scan read. Additive: two new tables.
-- By hand: the unique index on (id, tenant_id) comes before the foreign key that references it; the archive foreign key
-- sets only archive_id to null when a zip is removed (the tenant_id it shares with the scan key stays); and both tables
-- get the tenant_isolation policy of 0084.
CREATE TABLE "scan_archive_links" (
	"scan_id" text PRIMARY KEY NOT NULL,
	"tenant_id" uuid NOT NULL,
	"archive_id" uuid,
	"label" text NOT NULL,
	"content_sha256" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scan_upload_archives" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"repo_id" uuid NOT NULL,
	"label" text NOT NULL,
	"r2_key" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"content_sha256" text NOT NULL,
	"uploaded_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scan_upload_archives_label" CHECK (length("scan_upload_archives"."label") > 0),
	CONSTRAINT "scan_upload_archives_sha" CHECK ("scan_upload_archives"."content_sha256" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE UNIQUE INDEX "uq_scan_upload_archives_id_tenant" ON "scan_upload_archives" USING btree ("id","tenant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "uq_scan_upload_archives_r2_key" ON "scan_upload_archives" USING btree ("r2_key");--> statement-breakpoint
CREATE INDEX "idx_scan_upload_archives_repo_uploaded_at" ON "scan_upload_archives" USING btree ("repo_id","uploaded_at");--> statement-breakpoint
CREATE INDEX "idx_scan_archive_links_archive" ON "scan_archive_links" USING btree ("archive_id");--> statement-breakpoint
ALTER TABLE "scan_archive_links" ADD CONSTRAINT "scan_archive_links_scan_tenant_fk" FOREIGN KEY ("scan_id","tenant_id") REFERENCES "public"."scans"("id","tenant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scan_archive_links" ADD CONSTRAINT "scan_archive_links_archive_tenant_fk" FOREIGN KEY ("archive_id","tenant_id") REFERENCES "public"."scan_upload_archives"("id","tenant_id") ON DELETE SET NULL ("archive_id") ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scan_upload_archives" ADD CONSTRAINT "scan_upload_archives_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scan_upload_archives" ADD CONSTRAINT "scan_upload_archives_repo_tenant_fk" FOREIGN KEY ("repo_id","tenant_id") REFERENCES "public"."scan_repos"("id","tenant_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scan_upload_archives" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "scan_upload_archives" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "scan_upload_archives"
  USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);--> statement-breakpoint
ALTER TABLE "scan_archive_links" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "scan_archive_links" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "tenant_isolation" ON "scan_archive_links"
  USING ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid)
  WITH CHECK ("tenant_id" = nullif(current_setting('app.tenant_id', true), '')::uuid);
