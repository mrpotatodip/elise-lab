import { describe, expect, it } from "vitest";
import { gettingStarted, type GettingStartedInput } from "#/modules/getting-started/utils/getting-started";

const NONE: GettingStartedInput = { runners: [], scans: [], gitSkipped: false, dismissed: false };
const CONNECTED = { pairedAt: "2026-11-20T09:00:00.000Z" };
const WAITING = { pairedAt: null };
const scan = (status: "queued" | "running" | "succeeded" | "failed" | "stopped", files: string[] | null = null) => ({
  status,
  files,
  artifacts: null,
});

describe("gettingStarted", () => {
  it.each([
    ["no Runner and no Scan", NONE, [false, false, false, false, false], true],
    ["a Runner that never paired", { ...NONE, runners: [WAITING] }, [false, false, false, false, false], true],
    ["a Runner that connected", { ...NONE, runners: [CONNECTED] }, [true, true, false, false, false], true],
    [
      "a Runner that connected and is now offline",
      { ...NONE, runners: [{ pairedAt: "2026-11-01T09:00:00.000Z" }] },
      [true, true, false, false, false],
      true,
    ],
    [
      "a Scan that is running",
      { ...NONE, runners: [CONNECTED], scans: [scan("running")] },
      [true, true, false, true, false],
      true,
    ],
    [
      "a Scan that failed",
      { ...NONE, runners: [CONNECTED], scans: [scan("failed")] },
      [true, true, false, true, false],
      true,
    ],
    [
      "a Scan that was stopped",
      { ...NONE, runners: [CONNECTED], scans: [scan("stopped")] },
      [true, true, false, true, false],
      true,
    ],
    [
      "a Scan that succeeded with no Report",
      { ...NONE, runners: [CONNECTED], scans: [scan("succeeded", ["findings.json"])] },
      [true, true, false, true, false],
      true,
    ],
    [
      "a Scan with a Report",
      { ...NONE, runners: [CONNECTED], scans: [scan("succeeded", ["REPORT.md"])] },
      [true, true, false, true, true],
      false,
    ],
    ["a git task that was skipped", { ...NONE, gitSkipped: true }, [false, false, true, false, false], true],
    [
      "a card that was dismissed before a Report",
      { ...NONE, runners: [CONNECTED], dismissed: true },
      [true, true, false, false, false],
      false,
    ],
    [
      "a card that was dismissed and a Report exists",
      { ...NONE, scans: [scan("succeeded", ["REPORT.md"])], dismissed: true },
      [false, false, false, true, true],
      false,
    ],
    [
      "a Report with the git task never skipped",
      { ...NONE, scans: [scan("succeeded", ["REPORT.md"])] },
      [false, false, false, true, true],
      false,
    ],
  ] satisfies [string, GettingStartedInput, boolean[], boolean][])("for %s", (_name, input, done, show) => {
    const result = gettingStarted(input);
    expect(result.tasks.map((task) => task.done)).toEqual(done);
    expect(result.show).toBe(show);
  });
});
