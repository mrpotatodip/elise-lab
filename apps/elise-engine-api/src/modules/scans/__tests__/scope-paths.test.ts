import { describe, expect, it } from "vitest";
import { checkScopePaths, SCAN_SCOPE_PATHS_MAX } from "@repo/contracts/elise";
import { CreateScanBodySchema } from "#/modules/scans/schemas";

describe("checkScopePaths", () => {
  it.each([
    [["one"], ["one"]],
    [
      ["./one/", "two/sub/deeper"],
      ["one", "two/sub/deeper"],
    ],
    [[" one "], ["one"]],
    [
      [".hidden/dir", "name_with-chars@1+2=3~"],
      [".hidden/dir", "name_with-chars@1+2=3~"],
    ],
    [[], []],
  ])("keeps %j as %j", (given, kept) => {
    expect(checkScopePaths(given)).toEqual({ ok: true, paths: kept });
  });

  it.each([
    ["an empty entry", [""], "empty"],
    ["only blanks", ["   "], "empty"],
    ["the root", ["."], "whole repository"],
    ["the root with a slash", ["./"], "whole repository"],
    ["the root written twice", ["././"], "whole repository"],
    ["a lone slash", ["/"], "computer's root"],
    ["an absolute path", ["/etc"], "computer's root"],
    ["a drive letter", ["C:/one"], "computer's root"],
    ["a backslash", ["one\\two"], "backslash"],
    ["a .. part", ["one/../two"], "outside the repository"],
    ["a leading ..", ["../one"], "outside the repository"],
    ["a leading dash", ["-rf"], "start with a dash"],
    ["a glob", ["one/*"], "without spaces or special characters"],
    ["a space", ["one two"], "without spaces or special characters"],
    ["a line break", ["one\ntwo"], "without spaces or special characters"],
    ["a double slash", ["one//two"], "double slash"],
    ["a . part", ["one/./two"], "lone ."],
    ["a repeat after cleaning", ["one", "./one/"], "twice"],
    ["a path that is too long", ["a".repeat(201)], "longer than 200"],
    ["too many folders", Array.from({ length: SCAN_SCOPE_PATHS_MAX + 1 }, (_, index) => `dir${index}`), "at most"],
  ])("refuses %s", (_name, given, reason) => {
    const checked = checkScopePaths(given);

    expect(checked).toMatchObject({ ok: false, message: expect.stringContaining(reason) });
  });

  it.each([
    [
      ["one two"],
      `"one two" can't be used: it has a character that is not allowed. Use folder names without spaces or special characters, written from the repository's root.`,
    ],
    [
      ["../secrets"],
      `"../secrets" can't be used: it points outside the repository. Write it from the repository's root, without ..`,
    ],
    [
      ["one\ntwo"],
      `"one two" can't be used: it has a character that is not allowed. Use folder names without spaces or special characters, written from the repository's root.`,
    ],
    [["a", "a"], `"a" can't be used: it is in the list twice. Remove one of them.`],
  ])("says %j in one line, entry first, then the fix", (given, message) => {
    expect(checkScopePaths(given)).toEqual({ ok: false, message });
  });

  it("shortens a very long entry in its message", () => {
    const checked = checkScopePaths(["a".repeat(201)]);

    expect(checked).toEqual({
      ok: false,
      message: `"${"a".repeat(40)}…" can't be used: it is longer than 200 characters. Use a shorter path.`,
    });
  });
});

describe("the scope_paths field of POST /scans", () => {
  const body = { repo: "https://github.com/octocat/Hello-World" };

  it("accepts a clean list and none at all", () => {
    expect(CreateScanBodySchema.safeParse({ ...body, scope_paths: ["one", "two/sub"] }).success).toBe(true);
    expect(CreateScanBodySchema.safeParse(body).success).toBe(true);
  });

  it("hands the service the cleaned list, and the body of a Scan with no folders unchanged", () => {
    const scoped = CreateScanBodySchema.parse({ ...body, scope_paths: ["./one/", " two/sub "] });
    const plain = CreateScanBodySchema.parse(body);

    expect(scoped.scope_paths).toEqual(["one", "two/sub"]);
    expect("scope_paths" in plain).toBe(false);
  });

  it("refuses a path that leaves the repository, naming the field", () => {
    const parsed = CreateScanBodySchema.safeParse({ ...body, scope_paths: ["../x"] });

    expect(parsed.success ? null : parsed.error.issues[0]?.message).toContain("scope_paths: ");
  });
});
