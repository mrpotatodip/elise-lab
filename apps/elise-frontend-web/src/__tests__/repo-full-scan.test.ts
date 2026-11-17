import { describe, expect, it } from "vitest";
import { repoNotFullScanIds } from "#/modules/repo/utils/repo-full-scan";

const scan = (scanId: string, branchId: string | null, status: "succeeded" | "failed" = "succeeded") => ({ scanId, branchId, status });

const newestFirst = [scan("s4", "b1"), scan("s3", "b1", "failed"), scan("s2", null), scan("s1", "b1"), scan("s0", "b1")];

describe("repoNotFullScanIds", () => {
  it.each([
    ["the newest succeeded Scans of the branch above the full Scan", "s1", ["s4"]],
    ["none when the newest Scan is the full Scan", "s4", []],
    ["every succeeded Scan of the branch when none weighs", null, ["s4", "s1", "s0"]],
    ["every one shown when the full Scan is older than the history", "older", ["s4", "s1", "s0"]],
    ["none when an older engine sends no full Scan", undefined, []],
  ] as const)("gives %s", (_case, fullScanId, expected) => {
    expect([...repoNotFullScanIds({ id: "b1", fullScanId }, newestFirst)]).toEqual(expected);
  });
});
