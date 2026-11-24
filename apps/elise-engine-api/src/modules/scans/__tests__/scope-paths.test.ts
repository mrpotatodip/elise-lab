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
    ["the root", ["."], "root"],
    ["the root with a slash", ["./"], "root"],
    ["the root written twice", ["././"], "root"],
    ["a lone slash", ["/"], "absolute"],
    ["an absolute path", ["/etc"], "absolute"],
    ["a drive letter", ["C:/one"], "absolute"],
    ["a backslash", ["one\\two"], "backslash"],
    ["a .. part", ["one/../two"], ".."],
    ["a leading ..", ["../one"], ".."],
    ["a leading dash", ["-rf"], "starts with -"],
    ["a glob", ["one/*"], "globs"],
    ["a space", ["one two"], "spaces"],
    ["a line break", ["one\ntwo"], "globs"],
    ["a double slash", ["one//two"], "empty part"],
    ["a . part", ["one/./two"], ". part"],
    ["a repeat after cleaning", ["one", "./one/"], "twice"],
    ["a path that is too long", ["a".repeat(201)], "too long"],
    ["too many folders", Array.from({ length: SCAN_SCOPE_PATHS_MAX + 1 }, (_, index) => `dir${index}`), "at most"],
  ])("refuses %s", (_name, given, reason) => {
    const checked = checkScopePaths(given);

    expect(checked).toMatchObject({ ok: false, message: expect.stringContaining(reason) });
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
