import type { ScanStatus } from "#/modules/scan";
import type { RepoBranch } from "../schemas";

// -----
// The succeeded Scans of a branch that are newer than its latest
// full Scan: they ran, but weigh nothing in a Verdict, so "not in
// the latest full scan" is not measured against them. With no
// full Scan every succeeded Scan of the branch is one; when the
// full Scan is older than the history shown, every one shown is.
// Empty when the engine sends no fullScanId (an older engine).
// -----
export const repoNotFullScanIds = (branch: Pick<RepoBranch, "id" | "fullScanId">, newestFirst: readonly Pick<ScanStatus, "scanId" | "branchId" | "status">[]) => {
  if (branch.fullScanId === undefined) return new Set<string>();
  const tip = newestFirst.findIndex((scan) => scan.scanId === branch.fullScanId);
  const newer = tip === -1 ? newestFirst : newestFirst.slice(0, tip);
  return new Set(newer.filter((scan) => scan.branchId === branch.id && scan.status === "succeeded").map((scan) => scan.scanId));
};
