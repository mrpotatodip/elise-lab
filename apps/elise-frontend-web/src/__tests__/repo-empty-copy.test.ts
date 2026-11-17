import { describe, expect, it } from "vitest";
import { repoEmptyCopy } from "#/modules/repo/utils/repo-empty-copy";

describe("repoEmptyCopy", () => {
  it("says nothing needs action only when the branch has no open problem", () => {
    expect(repoEmptyCopy("action", 0).title).toBe("Nothing needs action");
  });

  it.each([1, 4])("never says nothing needs action while %i problems are open", (openTotal) => {
    const copy = repoEmptyCopy("action", openTotal);
    expect(copy.title).not.toBe("Nothing needs action");
    expect(copy.text).toContain("No scan closes a problem");
  });

  it("says a scan never closes a problem on the closed-by-a-scan filter", () => {
    expect(repoEmptyCopy("scan", 3).text).toContain("never closes a problem");
  });
});
