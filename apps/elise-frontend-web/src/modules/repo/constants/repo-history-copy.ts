// -----
// The note on old open problems. The findings history stopped
// at the end of the lite era: a new scan does not write to it, so the
// open counts on the repository and branch screens are the old ones,
// not re-checked. Where a new scan's problems are is part of the note.
// -----
export const REPO_HISTORY_NOTE = {
  title: "These open counts are from before scan profiles.",
  body: "Elise has not re-checked them. A new scan's problems are on its scan page and in the Verdict, not in these counts.",
  byHand: "You can still mark an old problem fixed, dismissed or accepted by hand.",
} as const;
