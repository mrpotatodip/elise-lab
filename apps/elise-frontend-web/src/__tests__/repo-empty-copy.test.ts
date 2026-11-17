import { describe, expect, it } from "vitest";
import { repoEmptyCopy } from "#/modules/repo/utils/repo-empty-copy";

describe("repoEmptyCopy", () => {
  it("says nothing needs action once every page is loaded", () => {
    expect(repoEmptyCopy("action", false).title).toBe("Nothing needs action");
  });

  it.each(["action", "decided", "scan"] as const)("asks to load more, not to switch filter, while pages of %s are not loaded", (filter) => {
    const copy = repoEmptyCopy(filter, true);
    expect(copy.text).toContain("Load more findings");
  });

  it("does not say a scan never closes a problem on the closed-by-a-scan filter", () => {
    expect(repoEmptyCopy("scan", false).text).not.toContain("never closes");
  });
});
