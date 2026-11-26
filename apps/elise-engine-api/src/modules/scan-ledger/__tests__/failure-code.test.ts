import { describe, expect, it } from "vitest";
import { failureCodeOf } from "#/modules/scan-ledger";

// -----
// The error text is what `scan-sandbox` throws: "command exited N: " and the
// last of git's output. The git lines are copied from a real run with no terminal.
// -----
const NOT_FOUND =
  "command exited 128: Cloning into '/workspace/repo'...\nremote: Repository not found.\nfatal: repository 'https://github.com/o/n/' not found";

describe("failureCodeOf", () => {
  it.each([
    ["a repository that is missing or private", NOT_FOUND, "repo_unreadable"],
    [
      "a clone git would prompt for a login on",
      "command exited 128: fatal: could not read Username for 'https://github.com': No such device or address",
      "repo_unreadable",
    ],
    [
      "a branch, tag or commit that does not exist",
      "command exited 128: fatal: couldn't find remote ref nope-branch",
      "ref_not_found",
    ],
    ["a clone the timeout killed", "command exited 124: Cloning into '/workspace/repo'...", "clone_timeout"],
    ["an agent that ran out of memory", "claude exited 1: RangeError: Out of memory", "out_of_memory"],
    [
      "a plan that hit its usage limit",
      "The check phase failed: claude exited 1: You've hit your 5-hour limit · resets 5:40pm",
      "plan_usage_limit",
    ],
    [
      "a review that ended with no report, whose text mentions budget",
      "The audit finished without writing REPORT.md. The agent may have been stopped by a permission, or run out of budget.",
      "no_report",
    ],
    ["a scan that reached its spend limit", "claude exited 1: Error: Exceeded USD budget (2)", "budget_spent"],
    ["a scan the engine stopped at its limit", "the scan's budget is spent", "budget_spent"],
    ["a scan that timed out", "the scan timed out", "timed_out"],
    ["an error that only mentions a budget", "the agent said its budget plan was unclear", null],
    ["no error", null, null],
  ])("names %s", (_name, error, code) => {
    expect(failureCodeOf(error)).toBe(code);
  });
});
