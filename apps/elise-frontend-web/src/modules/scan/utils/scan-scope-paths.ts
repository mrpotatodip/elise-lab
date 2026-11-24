import { checkScopePaths, SCAN_SCOPE_PATHS_MAX, type ScanStatus } from "@repo/contracts/elise";

export function scanScopePathsOf(text: string) {
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line !== "");
  if (lines.length === 0) return { paths: undefined, problem: null };
  const checked = checkScopePaths(lines);
  if (!checked.ok) return { paths: undefined, problem: checked.message };
  return { paths: checked.paths, problem: null };
}

export const SCAN_SCOPE_PATHS_LIMIT = SCAN_SCOPE_PATHS_MAX;

export function scanScopeNote(scan: Pick<ScanStatus, "scopePaths">) {
  const paths = scan.scopePaths ?? [];
  if (paths.length === 0) return null;
  return {
    title: `Only ${paths.length === 1 ? "this folder" : "these folders"} of the repository ${paths.length === 1 ? "was" : "were"} scanned: ${paths.join(", ")}`,
    detail:
      "The rest of the repository was not looked at, so this Scan does not show that it is free of findings. It counts as a partial Scan in the Verdict. Run a Scan of everything for a full pass.",
  };
}
