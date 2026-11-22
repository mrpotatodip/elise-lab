-- Upload limits and retention (#233): when a person removed an upload app. Its zips are deleted and the row stays, so its
-- Scans keep their History. Additive: one nullable column, no row rewritten.
ALTER TABLE "scan_repos" ADD COLUMN "removed_at" timestamp with time zone;