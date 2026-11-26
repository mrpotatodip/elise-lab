import { describe, expect, it } from "vitest";
import { scanCreateBodyOf } from "#/modules/scan/utils/scan-create-body";
import { scanPlanSummary } from "#/modules/scan/utils/scan-plan-summary";
import {
  scanCustomizeProblems,
  scanScopeNote,
  scanScopePathsOf,
  scanScopeSentence,
} from "#/modules/scan/utils/scan-scope-paths";

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
    ["/etc", "computer's root"],
    ["one\none", "twice"],
    ["src/*", "special characters"],
    ["one\\two", "backslash"],
  ])("refuses %j and says why", (text, reason) => {
    const read = scanScopePathsOf(text);

    expect(read.paths).toBeUndefined();
    expect(read.problem).toContain(reason);
  });
});

describe("scanScopeSentence", () => {
  it.each([
    [undefined, null],
    [[], null],
    [["src"], "It reads only src, so it is a partial Scan."],
    [["a", "b", "c"], "It reads only a, b and c, so it is a partial Scan."],
    [["a", "b", "c", "d"], "It reads only 4 folders, so it is a partial Scan."],
  ])("says for %j: %j", (paths, sentence) => {
    expect(scanScopeSentence(paths)).toBe(sentence);
  });

  it("is part of the plan summary only when folders are set", () => {
    const base = {
      repo: "https://github.com/honojs/hono",
      model: "claude-sonnet-5-5",
      effort: "high",
      profile: "standard",
    } as const;

    expect(scanPlanSummary({ ...base, scopePaths: ["src", "lib"] })).toContain(
      "with Claude Sonnet 5.5. It reads only src and lib, so it is a partial Scan. You'll land",
    );
    expect(scanPlanSummary(base)).toBe(
      "You're about to run a balanced audit of honojs/hono with Claude Sonnet 5.5. You'll land on the report page, where progress updates on its own.",
    );
  });
});

describe("scanCustomizeProblems", () => {
  it("lists the reason of every invalid field Customize holds", () => {
    expect(scanCustomizeProblems({ problem: "Enter a dollar amount" }, { problem: "bad folder" })).toEqual([
      "Spend limit: Enter a dollar amount",
      "Folders: bad folder",
    ]);
  });

  it("is empty when both fields are fine", () => {
    expect(scanCustomizeProblems({ problem: null }, { problem: null })).toEqual([]);
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
