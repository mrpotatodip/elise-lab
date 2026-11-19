import type { ScanArchiveRef } from "@repo/contracts/elise";

// -----
// Which zip an upload Scan read, as the History shows it. The
// engine keeps the label after the zip is removed and drops its
// id, so the Scan says the file is gone. null for a git Scan.
// -----
export function scanArchiveNote(archive: ScanArchiveRef | null | undefined): string | null {
  if (!archive) return null;
  return archive.id === null ? `${archive.label} (file removed)` : archive.label;
}
