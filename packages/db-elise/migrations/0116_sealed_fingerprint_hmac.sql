ALTER TABLE "scan_finding_triage" ADD COLUMN "fingerprint_hmac" text;--> statement-breakpoint
ALTER TABLE "scan_findings" ADD COLUMN "fingerprint_hmac" text;--> statement-breakpoint
ALTER TABLE "scan_repo_findings" ADD COLUMN "fingerprint_hmac" text;--> statement-breakpoint
ALTER TABLE "scan_finding_comments" ADD COLUMN "fingerprint_hmac" text;