import { Effect } from "effect";
import { describe, expect, it } from "vitest";
import type { ScanParams } from "#/schemas";
import type { ResumeSource, ScanPatch } from "#/modules/scan-ledger";
import { RESUME_ARCHIVE_MESSAGE } from "#/modules/scans/constants";
import { abandonScanSvc } from "#/modules/scans/handlers";
import { resumeRefusalOf } from "#/modules/scans/utils";

const params = (resumesScanId?: string): ScanParams => ({
  scanId: "new-scan",
  accountId: "acct",
  repo: "https://github.com/o/n",
  options: { skill: "full", model: "claude-sonnet-5-5", effort: "high", profile: "standard", maxBudgetUsd: 7 },
  createdAt: "2026-11-25T09:00:00Z",
  resumesScanId,
});

const abandoned = async (resumesScanId?: string) => {
  const patches: ScanPatch[] = [];
  const repo = {
    mark: (_account: string, _scan: string, patch: ScanPatch) => {
      patches.push(patch);
      return Effect.void;
    },
  };
  await Effect.runPromise(abandonScanSvc(repo, { params: params(resumesScanId), holdUsd: 0 }, "could not start"));
  return patches[0];
};

describe("abandoning a Scan that never started", () => {
  it("gives the link of a Resumed Scan back, so the Scan it resumes can be resumed again", async () => {
    expect(await abandoned("old-scan")).toMatchObject({ status: "failed", resumesScanId: null });
  });

  it("leaves an ordinary Scan's patch without a link field", async () => {
    expect(await abandoned()).not.toHaveProperty("resumesScanId");
  });
});

describe("resuming a Scan of an uploaded zip", () => {
  it.each([null, "archive-1"])("is refused with its own sentence (zip id %s)", (archiveId) => {
    const source: ResumeSource = {
      id: "s1",
      status: "failed",
      error: "crashed",
      ref: null,
      maxBudgetUsd: 7,
      repoUrl: "https://github.com/o/n",
      provider: "github",
      job: { runnerId: "r1", optionsJson: "{}" },
      resumedByScanId: null,
      archive: { archiveId },
    };

    expect(resumeRefusalOf(source)).toEqual({ kind: "invalid", message: RESUME_ARCHIVE_MESSAGE });
  });
});
