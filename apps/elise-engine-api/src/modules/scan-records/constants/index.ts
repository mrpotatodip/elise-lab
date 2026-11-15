// -----
// Reading findings.json
// -----
export const SCAN_RECORDS_FINDINGS_FILE = "findings.json";
export const SCAN_RECORDS_RECORDED_SKILL = "lite";
// -----
// A full Scan (a profile Scan) writes the nested shape: it has no
// class of its own, and the column is required.
// -----
export const SCAN_RECORDS_PROFILE_SKILL = "full";
export const SCAN_RECORDS_FULL_CLASS = "full-audit";
export const SCAN_RECORDS_REPORT_FILE = "REPORT.md";
export const SCAN_RECORDS_LEDGER_FILE = "coverage-ledger.json";
export const SCAN_RECORDS_RECHECK_FILE = "recheck.json";
export const SCAN_RECORDS_PRIOR_FILE = "prior-findings.json";

// -----
// History: the most prior findings one scan re-checks.
// Each costs the agent tokens, so the worst come first.
// -----
export const SCAN_RECORDS_PRIOR_LIMIT = 50;
