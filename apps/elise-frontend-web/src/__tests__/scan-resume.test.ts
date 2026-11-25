import { describe, expect, it } from "vitest";
import {
  RESUME_ALREADY_RESUMED_REASON,
  RESUME_POOL_SPENT_REASON,
  RESUME_ZIP_REMOVED_REASON,
  scanResumeState,
} from "#/modules/scan/utils/scan-resume";

const runner = { id: "6f1c1c3e-0000-4000-8000-000000000000", name: "laptop" };

describe("scanResumeState", () => {
  it.each(["failed", "stopped"] as const)("lets a %s Runner Scan resume", (status) => {
    expect(scanResumeState({ status, runner })).toEqual({ kind: "enabled" });
  });

  it.each(["queued", "running", "succeeded"] as const)("shows no button on a %s Scan", (status) => {
    expect(scanResumeState({ status, runner })).toEqual({ kind: "hidden" });
  });

  it("shows no button on a cloud Scan", () => {
    expect(scanResumeState({ status: "failed", runner: null })).toEqual({ kind: "hidden" });
  });

  it("disables it with the new-Scan advice when the Pool was spent", () => {
    expect(scanResumeState({ status: "failed", runner, failureCode: "budget_spent" })).toEqual({
      kind: "disabled",
      reason: RESUME_POOL_SPENT_REASON,
    });
  });

  it("disables it when the Scan was already resumed", () => {
    expect(scanResumeState({ status: "stopped", runner, resumedByScanId: "scan-2" })).toEqual({
      kind: "disabled",
      reason: RESUME_ALREADY_RESUMED_REASON,
    });
  });

  it("disables it when the zip was removed", () => {
    const archive = { id: null, label: "app.zip", contentSha256: "a".repeat(64) };
    expect(scanResumeState({ status: "failed", runner, archive })).toEqual({
      kind: "disabled",
      reason: RESUME_ZIP_REMOVED_REASON,
    });
  });
});
