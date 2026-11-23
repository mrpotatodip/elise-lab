import { SCAN_FAILURE_CODE_VALUES } from "@repo/contracts/elise";
import { describe, expect, it } from "vitest";
import { scanFailure } from "#/modules/scan/utils/scan-format";

const NOT_FOUND = "command exited 128: Cloning into '/workspace/repo'...\nremote: Repository not found.\nfatal: repository 'https://github.com/o/n/' not found";

describe("scanFailure", () => {
  it.each(SCAN_FAILURE_CODE_VALUES)("has its own copy for the code %s", (code) => {
    const failure = scanFailure("the agent stopped", code);
    expect(failure.title).not.toBe("the agent stopped");
    expect(failure.advice).not.toBe("");
  });

  it("points an unreadable repository at `elise-runner doctor`, since a private one looks the same", () => {
    expect(scanFailure(NOT_FOUND, "repo_unreadable").advice).toContain("elise-runner doctor");
  });

  it("keeps git's own text as the detail", () => {
    expect(scanFailure(NOT_FOUND, "repo_unreadable").detail).toContain("fatal: repository");
  });

  it("does not read the words of the error when it has no code", () => {
    expect(scanFailure("Exceeded USD budget (2)", null).title).toBe("Exceeded USD budget (2)");
  });

  it("falls back to the first line when it knows no cause", () => {
    expect(scanFailure("the agent stopped\nmore").title).toBe("the agent stopped");
  });
});
