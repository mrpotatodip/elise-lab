import type { ScanLike, UntrackedCopy } from "../types";

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
