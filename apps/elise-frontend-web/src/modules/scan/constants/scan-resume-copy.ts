// -----
// Why the Resume button is disabled (ADR 0016). The engine refuses with the
// same words, so the button and the route say one thing.
// -----
export const RESUME_POOL_SPENT_REASON =
  "This Scan spent its whole Budget cap, so there is no money left to resume with. Start a new Scan with a bigger profile.";
export const RESUME_ARCHIVE_REASON =
  "A Scan of an uploaded zip cannot be resumed, because the Runner resumes only a Scan of a git repository. Upload the zip again as a new Scan.";
export const RESUME_ALREADY_RESUMED_REASON =
  "This Scan was already resumed as another Scan. Open that Scan to carry on.";
