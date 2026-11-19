import { describe, expect, it } from "vitest";
import { runnerAddedBy, runnerShownState } from "#/modules/runner/utils";
import type { Runner } from "#/modules/runner/schemas";

const runner = (createdByName?: string | null): Runner => ({
  id: "11111111-1111-4111-8111-111111111111",
  name: "Box",
  state: "connected",
  createdAt: "2026-11-18T09:00:00.000Z",
  expiresAt: null,
  pairedAt: null,
  lastSeenAt: null,
  createdByName,
});

describe("whether a paired Runner is running", () => {
  const now = Date.parse("2026-11-19T12:00:00.000Z");

  it.each([
    { seen: "2026-11-19T11:58:00.000Z", expected: "connected" },
    { seen: "2026-11-19T11:50:00.000Z", expected: "offline" },
    { seen: null, expected: "offline" },
  ])("reads $expected when last seen $seen", ({ seen, expected }) => {
    expect(runnerShownState({ ...runner(), lastSeenAt: seen }, now)).toBe(expected);
  });
});

describe("who added a Runner", () => {
  it.each([
    { name: "Ada Rossi", expected: "Added by Ada Rossi." },
    { name: null, expected: null },
    { name: undefined, expected: null },
  ])("reads $expected for $name", ({ name, expected }) => {
    expect(runnerAddedBy(runner(name))).toBe(expected);
  });
});
