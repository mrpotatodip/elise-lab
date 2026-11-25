ALTER TABLE "scan_runner_jobs" ADD COLUMN "resumes_scan_id" text;--> statement-breakpoint
ALTER TABLE "scans" ADD COLUMN "resumes_scan_id" text;--> statement-breakpoint
ALTER TABLE "scans" ADD CONSTRAINT "scans_resumes_tenant_fk" FOREIGN KEY ("resumes_scan_id","tenant_id") REFERENCES "public"."scans"("id","tenant_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "uq_scans_resumes_scan_id" ON "scans" USING btree ("resumes_scan_id") WHERE "scans"."resumes_scan_id" is not null;