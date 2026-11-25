import type { ScanStatus } from "../schemas";

export type ScanResumeState = { kind: "hidden" } | { kind: "enabled" } | { kind: "disabled"; reason: string };

export const RESUME_POOL_SPENT_REASON =
  "This Scan spent its whole Budget cap, so there is no money left to resume with. Start a new Scan with a bigger profile.";
export const RESUME_ZIP_REMOVED_REASON =
  "The zip this Scan read was removed, so it cannot be resumed. Upload it again.";
export const RESUME_ALREADY_RESUMED_REASON =
  "This Scan was already resumed as another Scan. Open that Scan to carry on.";

export function scanResumeState(
  scan: Pick<ScanStatus, "status" | "runner" | "failureCode" | "resumedByScanId" | "archive">,
): ScanResumeState {
  if (!scan.runner) return { kind: "hidden" };
  if (scan.status !== "failed" && scan.status !== "stopped") return { kind: "hidden" };
  if (scan.resumedByScanId) return { kind: "disabled", reason: RESUME_ALREADY_RESUMED_REASON };
  if (scan.status === "failed" && scan.failureCode === "budget_spent") {
    return { kind: "disabled", reason: RESUME_POOL_SPENT_REASON };
  }
  if (scan.archive && scan.archive.id === null) return { kind: "disabled", reason: RESUME_ZIP_REMOVED_REASON };
  return { kind: "enabled" };
}
