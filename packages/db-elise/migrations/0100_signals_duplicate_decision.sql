ALTER TABLE "scan_finding_triage" DROP CONSTRAINT "scan_finding_triage_status";--> statement-breakpoint
ALTER TABLE "scan_finding_triage" ADD COLUMN "duplicate_of" text;--> statement-breakpoint
ALTER TABLE "scan_finding_triage" ADD CONSTRAINT "scan_finding_triage_duplicate" CHECK (("scan_finding_triage"."status" = 'duplicate') = ("scan_finding_triage"."duplicate_of" is not null));--> statement-breakpoint
ALTER TABLE "scan_finding_triage" ADD CONSTRAINT "scan_finding_triage_status" CHECK ("scan_finding_triage"."status" in ('open', 'fixed', 'false_positive', 'accepted_risk', 'duplicate'));