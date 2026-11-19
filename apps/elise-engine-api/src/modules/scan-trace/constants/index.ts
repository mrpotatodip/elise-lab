// -----
// The answer to a Runner that sends a Trace for a Scan it does not
// hold: the same 404 whether the Scan is another Runner's or unknown.
// -----
export const SCAN_TRACE_JOB_NOT_FOUND = "No Scan of this Runner has that ID.";

// -----
// A read starts this far before its cursor. A writer's row is stamped
// when its statement runs but is visible only when it commits, so a
// slow commit can land behind a cursor a reader already holds. Rows
// read twice are harmless: the dashboard replaces an entry by id.
// -----
export const SCAN_TRACE_CURSOR_OVERLAP_SECONDS = 5;
