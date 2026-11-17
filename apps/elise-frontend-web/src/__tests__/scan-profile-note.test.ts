import { describe, expect, it } from "vitest";
import { scanProfileNote } from "#/modules/scan/utils/scan-profile-note";

describe("scanProfileNote", () => {
  it("names the profile asked for and the profile met when the Scan ran as a smaller one", () => {
    expect(scanProfileNote("deep", "standard")).toEqual({
      kind: "lesser",
      badge: "Ran as Balanced",
      title: "Asked for Exhaustive. Ran as Balanced.",
      detail: "The extra work that Exhaustive needs did not run. The findings are kept. Run the Scan again on a Runner or in the cloud for the full work.",
    });
  });

  it("calls the Focused profile a single pass", () => {
    expect(scanProfileNote("deep", "quick")?.title).toBe("Asked for Exhaustive. Ran as Focused, a single pass.");
  });

  it("says the work of no profile ran when the Scan met none", () => {
    expect(scanProfileNote("standard", "none")).toEqual({
      kind: "unmet",
      badge: "Did not run as asked",
      title: "Asked for Balanced. Its work did not run.",
      detail: "This Scan did not do the work of Focused, Balanced or Exhaustive. The findings are kept, but they do not come from a full review. Run the Scan again on a Runner or in the cloud.",
    });
  });

  it("shows nothing new when the Scan met the profile it asked for", () => {
    expect(scanProfileNote("deep", "deep")).toBeNull();
  });

  it("shows nothing new when the Scan was not checked", () => {
    expect(scanProfileNote("deep", null)).toBeNull();
    expect(scanProfileNote("deep", undefined)).toBeNull();
  });
});
