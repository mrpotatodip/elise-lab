import { useQuery } from "@tanstack/react-query";
import { verdictBlockers } from "../utils/verdict-blockers";
import { verdictQuery } from "./scan-queries";

const NONE: ReadonlySet<string> = new Set();

// -----
// The fingerprints of the open problems that block a commit, read from the
// verdict the Ready-to-ship card already loads (same query, so no extra
// request). Empty until it arrives, and for a branch with no commit yet.
// -----
export function useVerdictBlockers(repoId: string, commit: string | undefined): ReadonlySet<string> {
  const { data } = useQuery({
    ...verdictQuery(repoId, commit ?? ""),
    enabled: commit !== undefined,
    select: verdictBlockers,
  });
  return data ?? NONE;
}
