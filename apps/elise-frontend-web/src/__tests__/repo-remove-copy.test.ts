import { describe, expect, it } from "vitest";
import { canRemoveRepos, repoRemoveCopy } from "#/modules/repo/utils/repo-remove-copy";

const GIT_TEXT = "It leaves your list and your overview counts. Its Scans stay and adding it again brings them back.";

describe("repoRemoveCopy", () => {
  it("asks about a git repo without mentioning zips", () => {
    expect(repoRemoveCopy("acme/api", false)).toEqual({ title: "Remove acme/api?", description: GIT_TEXT });
  });

  it("adds that an upload app's zips are deleted for good", () => {
    expect(repoRemoveCopy("Billing", true).description).toBe(`${GIT_TEXT} Its zips are deleted for good.`);
  });
});

describe("canRemoveRepos", () => {
  it.each([
    ["an admin", ["company:repos:delete", "company:team:members:read"], true],
    ["a member", ["company:team:members:read"], false],
    ["no powers", [], false],
  ] as const)("is %s", (_name, powers, expected) => {
    expect(canRemoveRepos(powers)).toBe(expected);
  });
});
