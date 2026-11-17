import { describe, expect, it } from "vitest";
import { SCAN_WORKFLOW_FULL_MAX_POLLS, SCAN_WORKFLOW_FULL_PHASE_MINUTES, SCAN_WORKFLOW_POLL_SECONDS } from "#/modules/scan-workflow/constants";

const minutesOf = (polls: number) => (polls * SCAN_WORKFLOW_POLL_SECONDS) / 60;

describe("the time limits of a scan", () => {
  it("gives a scan 90 minutes", () => {
    expect(minutesOf(SCAN_WORKFLOW_FULL_MAX_POLLS)).toBe(90);
  });

  it("gives the phases slots that add up to the full total, so none can take the time of the ones after it", () => {
    const slots = Object.values(SCAN_WORKFLOW_FULL_PHASE_MINUTES);
    expect(slots.reduce((sum, minutes) => sum + minutes, 0)).toBe(minutesOf(SCAN_WORKFLOW_FULL_MAX_POLLS));
  });
});
