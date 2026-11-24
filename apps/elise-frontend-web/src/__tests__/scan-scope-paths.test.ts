import { describe, expect, it } from "vitest";
import { scanCreateBodyOf } from "#/modules/scan/utils/scan-create-body";
import { scanScopeNote, scanScopePathsOf } from "#/modules/scan/utils/scan-scope-paths";

describe("scanScopePathsOf", () => {
  it.each([
    ["", undefined],
    ["  \n \n", undefined],
    ["one", ["one"]],
    ["one\n./two/sub/\n\n  three  ", ["one", "two/sub", "three"]],
    ["one\r\ntwo", ["one", "two"]],
  ])("reads %j as %j with no problem", (text, paths) => {
    expect(scanScopePathsOf(text)).toEqual({ paths, problem: null });
  });

  it.each([
    ["../outside", "outside"],
    ["/etc", "absolute"],
    ["one\none", "twice"],
    ["src/*", "globs"],
    ["one\\two", "backslash"],
  ])("refuses %j and says why", (text, reason) => {
    const read = scanScopePathsOf(text);

    expect(read.paths).toBeUndefined();
    expect(read.problem).toContain(reason);
  });
});

describe("a Scan of some folders", () => {
  it.each<[string[] | undefined, { scope_paths?: string[] }]>([
    [["one", "two"], { scope_paths: ["one", "two"] }],
    [[], {}],
    [undefined, {}],
  ])("sends %j as the engine's scope_paths", (scopePaths, expected) => {
    const body = scanCreateBodyOf({
      repo: "https://github.com/acme/app",
      model: "claude-sonnet-5-5",
      effort: "high",
      profile: "quick",
      scopePaths,
    });

    expect(body).toMatchObject(expected);
    expect(body).not.toHaveProperty("scopePaths");
  });

  it("says in the page's notice which folders were covered and that the rest was not", () => {
    const note = scanScopeNote({ status: "succeeded", scopePaths: ["one", "two"] });

    expect(note?.title).toContain("one, two");
    expect(note?.detail).toContain("partial");
    expect(scanScopeNote({ status: "succeeded", scopePaths: [] })).toBeNull();
    expect(scanScopeNote({ status: "succeeded" })).toBeNull();
  });

  it.each(["queued", "running", "failed", "stopped"] as const)("shows no notice for a %s Scan", (status) => {
    expect(scanScopeNote({ status, scopePaths: ["one"] })).toBeNull();
  });
});
