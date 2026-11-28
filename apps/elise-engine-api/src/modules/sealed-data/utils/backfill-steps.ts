export type BackfillColumn = { name: string; unless?: string };

export type BackfillStep = {
  table: string;
  keys: readonly string[];
  columns: readonly BackfillColumn[];
  fingerprint: "own" | "mapped" | null;
};

export const BACKFILL_STEPS: readonly BackfillStep[] = [
  {
    table: "scan_findings",
    keys: ["id"],
    columns: ["finding_id", "title", "class", "file", "impact", "evidence", "fix", "needs"].map((name) => ({ name })),
    fingerprint: "own",
  },
  { table: "scan_repo_findings", keys: ["branch_id", "fingerprint"], columns: [], fingerprint: "mapped" },
  { table: "scan_finding_triage", keys: ["id"], columns: [{ name: "note" }], fingerprint: "mapped" },
  {
    table: "scan_finding_comments",
    keys: ["id"],
    columns: [{ name: "body", unless: "deleted_at is not null" }],
    fingerprint: "mapped",
  },
  {
    table: "scan_runner_jobs",
    keys: ["scan_id"],
    columns: ["prompt", "options_json", "priors_json", "error", "files_json"].map((name) => ({ name })),
    fingerprint: null,
  },
  {
    table: "scans",
    keys: ["id"],
    columns: [{ name: "error", unless: "error = 'the scan stalled and was closed by a newer request'" }],
    fingerprint: null,
  },
  { table: "scan_upload_archives", keys: ["id"], columns: [{ name: "label" }], fingerprint: null },
  { table: "scan_archive_links", keys: ["scan_id"], columns: [{ name: "label" }], fingerprint: null },
  { table: "tenant_credit_ledger", keys: ["id"], columns: [{ name: "note" }], fingerprint: null },
];

export const BACKFILL_OBJECT_TABLES = ["scan_files", "scan_upload_archives"] as const;
