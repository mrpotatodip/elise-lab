import { describe, expect, it } from "vitest";
import { SCAN_WORKFLOW_FULL_MAX_POLLS, SCAN_WORKFLOW_FULL_PHASE_MINUTES, SCAN_WORKFLOW_POLL_SECONDS } from "#/modules/scan-workflow/constants";
import { SCANS_ACTIVE_FULL_WINDOW_MS } from "#/modules/scans/constants";
import { maxPollsOf } from "#/modules/scan-workflow/lib/max-polls";

const minutesOf = (polls: number) => (polls * SCAN_WORKFLOW_POLL_SECONDS) / 60;

describe("the time limits of a scan", () => {
  it("gives a scan 90 minutes", () => {
    expect(minutesOf(SCAN_WORKFLOW_FULL_MAX_POLLS)).toBe(90);
  });

  it("gives the phases slots that add up to the full total, so none can take the time of the ones after it", () => {
    const slots = Object.values(SCAN_WORKFLOW_FULL_PHASE_MINUTES);
    expect(slots.reduce((sum, minutes) => sum + minutes, 0)).toBe(minutesOf(SCAN_WORKFLOW_FULL_MAX_POLLS));
  });

  it("waits 540 polls for a Scan in the cloud and, for a Runner Scan, 90 minutes of Phases plus the 10 minute queue timeout plus 20 minutes for the clone, the validators and the repair run", () => {
    expect(maxPollsOf(undefined)).toBe(540);
    expect(maxPollsOf("runner-1")).toBe(720);
    expect(minutesOf(maxPollsOf("runner-1"))).toBe(90 + 10 + 20);
  });

  it("keeps the wait of a Runner Scan inside the window in which a full Scan counts as live", () => {
    expect(maxPollsOf("runner-1") * SCAN_WORKFLOW_POLL_SECONDS * 1000).toBeLessThan(SCANS_ACTIVE_FULL_WINDOW_MS);
  });
});
