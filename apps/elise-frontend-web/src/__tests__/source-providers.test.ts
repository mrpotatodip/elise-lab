import { describe, expect, it } from "vitest";
import { SOURCE_PROVIDER_LIST } from "#/providers/registry";

describe("SOURCE_PROVIDER_LIST", () => {
  it("offers the four providers of the contracts, in their order, with upload not open yet", () => {
    expect(SOURCE_PROVIDER_LIST.map((provider) => [provider.id, provider.label, provider.available])).toEqual([
      ["github", "GitHub", true],
      ["gitlab", "GitLab", true],
      ["gitlab-sh", "GitLab server", true],
      ["upload", "Upload", false],
    ]);
  });
});
