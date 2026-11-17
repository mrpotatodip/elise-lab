type ScanLike = { status: string };

// -----
// What the card says on a repository page that has no tracked branch. A Scan
// that is running or has ended is not "run a scan to start": the card says
// where its findings are instead. A profile Scan resolves no branch (ADR 0004),
// so a repository can hold finished Scans and still have no branch.
// -----
type UntrackedCopy = { title: string; description: string };

export function repoUntrackedCopy(history: readonly ScanLike[]): UntrackedCopy {
  if (history.some((scan) => scan.status === "queued" || scan.status === "running")) {
    return { title: "A scan is reading this repository", description: "Its findings show in the list below when it ends." };
  }
  if (history.length > 0) {
    return { title: "No branch history yet", description: "These scans are not on a branch's history, so each keeps its own findings. Open a scan in the list below for its report." };
  }
  return {
    title: "No branch tracked yet",
    description: "Run a scan of this repository to read its default branch, or add the repository again from the repository list with the branch names to track.",
  };
}
