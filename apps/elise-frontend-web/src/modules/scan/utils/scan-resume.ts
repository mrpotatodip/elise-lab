import { RESUME_ALREADY_RESUMED_REASON, RESUME_ARCHIVE_REASON, RESUME_POOL_SPENT_REASON } from "../constants";
import type { ScanStatus } from "../schemas";

export type ScanResumeState = { kind: "hidden" } | { kind: "enabled" } | { kind: "disabled"; reason: string };

export function scanResumeState(
  scan: Pick<ScanStatus, "status" | "runner" | "failureCode" | "resumedByScanId" | "archive">,
): ScanResumeState {
  if (!scan.runner) return { kind: "hidden" };
  if (scan.status !== "failed" && scan.status !== "stopped") return { kind: "hidden" };
  if (scan.resumedByScanId) return { kind: "disabled", reason: RESUME_ALREADY_RESUMED_REASON };
  if (scan.status === "failed" && scan.failureCode === "budget_spent") {
    return { kind: "disabled", reason: RESUME_POOL_SPENT_REASON };
  }
  if (scan.archive) return { kind: "disabled", reason: RESUME_ARCHIVE_REASON };
  return { kind: "enabled" };
}
