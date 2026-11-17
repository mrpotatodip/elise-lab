import { describe, expect, it } from "vitest";
import { repoUntrackedCopy } from "#/modules/repo/utils/repo-untracked-copy";

describe("repoUntrackedCopy", () => {
  it.each([
    ["a running scan", [{ status: "running" }], "A scan is reading this repository"],
    ["a queued scan", [{ status: "succeeded" }, { status: "queued" }], "A scan is reading this repository"],
    ["only ended scans", [{ status: "succeeded" }], "No branch history yet"],
    ["a failed scan", [{ status: "failed" }], "No branch history yet"],
    ["no scans", [], "No branch tracked yet"],
  ] as const)("says the right thing for %s", (_name, history, title) => {
    expect(repoUntrackedCopy(history).title).toBe(title);
  });
});
